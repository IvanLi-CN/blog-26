use napi::{Env, Task, bindgen_prelude::*};
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tantivy::{
    Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term,
    collector::TopDocs,
    query::{
        BooleanQuery, BoostQuery, EmptyQuery, Occur, PhrasePrefixQuery, PhraseQuery, Query,
        TermQuery,
    },
    schema::{
        Field, IndexRecordOption, STORED, STRING, Schema, TextFieldIndexing, TextOptions, Value,
    },
    tokenizer::{RegexTokenizer, TextAnalyzer, TokenStream},
};

const FIELDS: [&str; 5] = ["slug", "title", "excerpt", "body", "tags"];
const TOKENIZER: &str = "technical-v2";
fn err(e: impl std::fmt::Display) -> Error {
    Error::new(Status::GenericFailure, e.to_string())
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Ast {
    Term {
        value: String,
    },
    Phrase {
        value: String,
    },
    Prefix {
        value: String,
    },
    Column {
        column: String,
        child: Box<Ast>,
    },
    And {
        children: Vec<Ast>,
    },
    Or {
        children: Vec<Ast>,
    },
    Not {
        include: Box<Ast>,
        exclude: Box<Ast>,
    },
}

fn tokens(index: &Index, value: &str) -> Result<Vec<(usize, String)>> {
    let mut analyzer = index
        .tokenizers()
        .get(TOKENIZER)
        .ok_or_else(|| err("missing analyzer"))?;
    let normalized = value.to_ascii_lowercase();
    let mut stream = analyzer.token_stream(&normalized);
    let mut out = Vec::new();
    while stream.advance() {
        out.push((stream.token().position, stream.token().text.clone()));
    }
    Ok(out)
}

fn compile(
    index: &Index,
    ast: &Ast,
    scoped: Option<Field>,
    remaining: &mut usize,
) -> Result<Box<dyn Query>> {
    if *remaining == 0 {
        return Err(err("query budget exceeded"));
    }
    *remaining -= 1;
    match ast {
        Ast::Column { column, child } => {
            if !FIELDS.contains(&column.as_str()) {
                return Err(err("unsupported field"));
            }
            compile(
                index,
                child,
                Some(index.schema().get_field(column).map_err(err)?),
                remaining,
            )
        }
        Ast::And { children } | Ast::Or { children } => {
            let occur = if matches!(ast, Ast::And { .. }) {
                Occur::Must
            } else {
                Occur::Should
            };
            let clauses = children
                .iter()
                .map(|x| compile(index, x, scoped, remaining).map(|q| (occur, q)))
                .collect::<Result<Vec<_>>>()?;
            Ok(Box::new(BooleanQuery::new(clauses)))
        }
        Ast::Not { include, exclude } => Ok(Box::new(BooleanQuery::new(vec![
            (Occur::Must, compile(index, include, scoped, remaining)?),
            (Occur::MustNot, compile(index, exclude, scoped, remaining)?),
        ]))),
        Ast::Term { value } | Ast::Phrase { value } | Ast::Prefix { value } => {
            let positions = tokens(index, value)?;
            if positions.is_empty() {
                return Ok(Box::new(EmptyQuery));
            }
            let fields = match scoped {
                Some(f) => vec![f],
                None => FIELDS
                    .iter()
                    .map(|x| index.schema().get_field(x).map_err(err))
                    .collect::<Result<Vec<_>>>()?,
            };
            let mut clauses = Vec::new();
            for field in fields {
                let terms = positions
                    .iter()
                    .map(|(p, t)| (*p, Term::from_field_text(field, t)))
                    .collect::<Vec<_>>();
                let query: Box<dyn Query> = if matches!(ast, Ast::Prefix { .. }) {
                    let mut q = PhrasePrefixQuery::new_with_offset(terms);
                    q.set_max_expansions(256);
                    Box::new(q)
                } else if terms.len() == 1 {
                    Box::new(TermQuery::new(
                        terms[0].1.clone(),
                        IndexRecordOption::WithFreqs,
                    ))
                } else {
                    Box::new(PhraseQuery::new_with_offset(terms))
                };
                let weight = match index.schema().get_field_entry(field).name() {
                    "title" => 8.0,
                    "excerpt" | "tags" => 4.0,
                    _ => 1.0,
                };
                clauses.push((
                    Occur::Should,
                    Box::new(BoostQuery::new(query, weight)) as Box<dyn Query>,
                ));
            }
            Ok(Box::new(BooleanQuery::new(clauses)))
        }
    }
}

fn validate_prefixes(
    index: &Index,
    searcher: &tantivy::Searcher,
    ast: &Ast,
    scoped: Option<Field>,
) -> Result<()> {
    match ast {
        Ast::Column { column, child } => validate_prefixes(
            index,
            searcher,
            child,
            Some(index.schema().get_field(column).map_err(err)?),
        ),
        Ast::And { children } | Ast::Or { children } => {
            for child in children {
                validate_prefixes(index, searcher, child, scoped)?;
            }
            Ok(())
        }
        Ast::Not { include, exclude } => {
            validate_prefixes(index, searcher, include, scoped)?;
            validate_prefixes(index, searcher, exclude, scoped)
        }
        Ast::Prefix { value } => {
            let positions = tokens(index, value)?;
            let Some((_, prefix)) = positions.last() else {
                return Ok(());
            };
            let fields = match scoped {
                Some(field) => vec![field],
                None => FIELDS
                    .iter()
                    .map(|name| index.schema().get_field(name).map_err(err))
                    .collect::<Result<Vec<_>>>()?,
            };
            for field in fields {
                let mut found = std::collections::HashSet::new();
                for segment in searcher.segment_readers() {
                    let inverted = segment.inverted_index(field).map_err(err)?;
                    let mut stream = inverted
                        .terms()
                        .range()
                        .ge(prefix.as_bytes())
                        .into_stream()
                        .map_err(err)?;
                    while stream.advance() {
                        if !stream.key().starts_with(prefix.as_bytes()) {
                            break;
                        }
                        found.insert(stream.key().to_vec());
                        if found.len() > 256 {
                            return Err(err("query budget exceeded: prefix expansions"));
                        }
                    }
                }
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

#[derive(Deserialize)]
struct Update {
    id: String,
    version: String,
    #[serde(default)]
    deleted: bool,
    #[serde(default)]
    slug: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    excerpt: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    tags: String,
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    published: bool,
    #[serde(default)]
    publish_date: u64,
}
#[derive(Deserialize)]
struct Request {
    ast: Ast,
    limit: usize,
    #[serde(default)]
    offset: usize,
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    published_only: bool,
}
#[derive(Serialize)]
struct Hit {
    id: String,
    version: String,
    score: f32,
}
struct Engine {
    index: Index,
    reader: IndexReader,
    writer: Mutex<IndexWriter>,
}

#[napi]
pub struct SearchIndex {
    engine: Arc<Engine>,
}
#[napi]
impl SearchIndex {
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self> {
        std::fs::create_dir_all(&path).map_err(err)?;
        let mut builder = Schema::builder();
        builder.add_text_field("id", (STRING | STORED).set_fast(None));
        builder.add_u64_field("publish_date", STORED | tantivy::schema::FAST);
        for field in ["version", "type", "published"] {
            builder.add_text_field(field, STRING | STORED);
        }
        let opts = TextOptions::default().set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer(TOKENIZER)
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        );
        for field in FIELDS {
            builder.add_text_field(field, opts.clone());
        }
        let expected = builder.build();
        let index = if std::path::Path::new(&path).join("meta.json").exists() {
            Index::open_in_dir(&path).map_err(err)?
        } else {
            Index::create_in_dir(&path, expected.clone()).map_err(err)?
        };
        if index.schema() != expected {
            return Err(err("index schema mismatch; prepare required"));
        }
        index.tokenizers().register(
            TOKENIZER,
            TextAnalyzer::builder(RegexTokenizer::new(r"[A-Za-z0-9_+#]+|(?s:.)").map_err(err)?)
                .build(),
        );
        let writer = index.writer(50_000_000).map_err(err)?;
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()
            .map_err(err)?;
        Ok(Self {
            engine: Arc::new(Engine {
                index,
                reader,
                writer: Mutex::new(writer),
            }),
        })
    }
    #[napi]
    pub fn apply(&self, json: String) -> AsyncTask<ApplyTask> {
        AsyncTask::new(ApplyTask {
            engine: self.engine.clone(),
            json,
        })
    }
    #[napi]
    pub fn inventory(&self) -> AsyncTask<InventoryTask> {
        AsyncTask::new(InventoryTask {
            engine: self.engine.clone(),
        })
    }
    #[napi]
    pub fn search(&self, json: String) -> AsyncTask<SearchTask> {
        AsyncTask::new(SearchTask {
            engine: self.engine.clone(),
            json,
        })
    }
}
pub struct ApplyTask {
    engine: Arc<Engine>,
    json: String,
}
#[napi]
impl Task for ApplyTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> {
        let updates: Vec<Update> = serde_json::from_str(&self.json).map_err(err)?;
        if updates.len() > 500 {
            return Err(err("batch budget exceeded"));
        }
        let mut writer = self.engine.writer.lock().map_err(err)?;
        let schema = self.engine.index.schema();
        for update in updates {
            let id = schema.get_field("id").map_err(err)?;
            writer.delete_term(Term::from_field_text(id, &update.id));
            if update.deleted {
                continue;
            }
            let mut doc = TantivyDocument::default();
            for (field, value) in [
                ("id", update.id),
                ("version", update.version),
                ("type", update.r#type),
                (
                    "published",
                    if update.published {
                        "1".into()
                    } else {
                        "0".into()
                    },
                ),
                ("slug", update.slug),
                ("title", update.title),
                ("excerpt", update.excerpt),
                ("body", update.body),
                ("tags", update.tags),
            ] {
                let text = if FIELDS.contains(&field) {
                    value.to_ascii_lowercase()
                } else {
                    value
                };
                doc.add_text(schema.get_field(field).map_err(err)?, text);
            }
            doc.add_u64(schema.get_field("publish_date").map_err(err)?, update.publish_date);
            writer.add_document(doc).map_err(err)?;
        }
        writer.commit().map_err(err)?;
        self.engine.reader.reload().map_err(err)
    }
    fn resolve(&mut self, _: Env, _: ()) -> Result<()> {
        Ok(())
    }
}
pub struct SearchTask {
    engine: Arc<Engine>,
    json: String,
}
#[napi]
impl Task for SearchTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<String> {
        let req: Request = serde_json::from_str(&self.json).map_err(err)?;
        if req.limit == 0 || req.limit > 100 || req.offset > 10000 {
            return Err(err("result budget exceeded"));
        }
        let schema = self.engine.index.schema();
        let searcher = self.engine.reader.searcher();
        validate_prefixes(&self.engine.index, &searcher, &req.ast, None)?;
        let mut clauses = vec![(
            Occur::Must,
            compile(&self.engine.index, &req.ast, None, &mut 256)?,
        )];
        for (field, value) in [
            ("type", req.r#type),
            ("published", req.published_only.then(|| "1".into())),
        ] {
            if let Some(value) = value {
                clauses.push((
                    Occur::Must,
                    Box::new(TermQuery::new(
                        Term::from_field_text(schema.get_field(field).map_err(err)?, &value),
                        IndexRecordOption::Basic,
                    )),
                ));
            }
        }
        let invalid_identity = Arc::new(AtomicBool::new(false));
        let identity_error = invalid_identity.clone();
        let collector = TopDocs::with_limit(req.limit)
            .and_offset(req.offset)
            .tweak_score(move |segment: &tantivy::SegmentReader| {
                let invalid = identity_error.clone();
                let ids = segment.fast_fields().str("id").ok().flatten();
                let dates = segment.fast_fields().u64("publish_date").ok();
                move |doc: tantivy::DocId, score: tantivy::Score| {
                    let mut id = String::new();
                    if let Some(ids) = &ids {
                        if let Some(ord) = ids.term_ords(doc).next() {
                            if !matches!(ids.ord_to_str(ord, &mut id), Ok(true)) {
                                invalid.store(true, Ordering::Relaxed);
                            }
                        } else {
                            invalid.store(true, Ordering::Relaxed);
                        }
                    } else {
                        invalid.store(true, Ordering::Relaxed);
                    }
                    let publish_date = dates
                        .as_ref()
                        .and_then(|field| field.first(doc))
                        .unwrap_or(0);
                    (score, publish_date, std::cmp::Reverse(id))
                }
            });
        let top = searcher
            .search(&BooleanQuery::new(clauses), &collector)
            .map_err(err)?;
        if invalid_identity.load(Ordering::Relaxed) {
            return Err(err("invalid index identity"));
        }
        let mut hits = Vec::new();
        for ((score, publish_date, _), address) in top {
            let doc: TantivyDocument = searcher.doc(address).map_err(err)?;
            let get = |name| -> Result<String> {
                Ok(doc
                    .get_first(schema.get_field(name).map_err(err)?)
                    .and_then(|x| x.as_str())
                    .ok_or_else(|| err("missing stored identity"))?
                    .to_owned())
            };
            hits.push((
                Hit {
                    id: get("id")?,
                    version: get("version")?,
                    score,
                },
                publish_date,
            ));
        }
        hits.sort_by(|(a, a_date), (b, b_date)| {
            b.score
                .total_cmp(&a.score)
                .then(b_date.cmp(a_date))
                .then(a.id.cmp(&b.id))
        });
        serde_json::to_string(&hits.into_iter().map(|(hit, _)| hit).collect::<Vec<_>>())
            .map_err(err)
    }
    fn resolve(&mut self, _: Env, output: String) -> Result<String> {
        Ok(output)
    }
}

pub struct InventoryTask {
    engine: Arc<Engine>,
}
#[napi]
impl Task for InventoryTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> Result<String> {
        let searcher = self.engine.reader.searcher();
        let schema = self.engine.index.schema();
        let mut hits = Vec::new();
        for (ordinal, segment) in searcher.segment_readers().iter().enumerate() {
            for doc_id in segment.doc_ids_alive() {
                let doc: TantivyDocument = searcher
                    .doc(tantivy::DocAddress::new(ordinal as u32, doc_id))
                    .map_err(err)?;
                let get = |name| -> Result<String> {
                    Ok(doc
                        .get_first(schema.get_field(name).map_err(err)?)
                        .and_then(|x| x.as_str())
                        .ok_or_else(|| err("missing stored identity"))?
                        .to_owned())
                };
                hits.push(Hit {
                    id: get("id")?,
                    version: get("version")?,
                    score: 0.0,
                });
            }
        }
        serde_json::to_string(&hits).map_err(err)
    }
    fn resolve(&mut self, _: Env, output: String) -> Result<String> {
        Ok(output)
    }
}

#[napi]
pub fn open_search_index(path: String) -> AsyncTask<OpenTask> {
    AsyncTask::new(OpenTask { path })
}
pub struct OpenTask {
    path: String,
}
#[napi]
impl Task for OpenTask {
    type Output = SearchIndex;
    type JsValue = SearchIndex;
    fn compute(&mut self) -> Result<SearchIndex> {
        SearchIndex::new(self.path.clone())
    }
    fn resolve(&mut self, _: Env, output: SearchIndex) -> Result<SearchIndex> {
        Ok(output)
    }
}
