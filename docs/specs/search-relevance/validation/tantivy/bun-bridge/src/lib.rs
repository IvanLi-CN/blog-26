use napi::{bindgen_prelude::*, Env, Task};
use napi_derive::napi;
use tantivy::{collector::TopDocs, doc, query::QueryParser, schema::{Document, Schema, STORED, STRING, TEXT}, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term};

fn native_error(error: impl std::fmt::Display) -> Error {
    Error::new(Status::GenericFailure, error.to_string())
}

#[napi(object)]
pub struct Hit {
    pub score: f64,
    pub document: String,
}

fn search(index: &Index, reader: &IndexReader, query: &str, limit: u32) -> Result<Vec<Hit>> {
    if limit == 0 || limit > 100 {
        return Err(Error::new(Status::InvalidArg, "limit must be between 1 and 100"));
    }
    let schema = index.schema();
    let parser = QueryParser::for_index(index, vec![schema.get_field("title").map_err(native_error)?, schema.get_field("body").map_err(native_error)?]);
    let query = parser.parse_query(query).map_err(native_error)?;
    let searcher = reader.searcher();
    let docs = searcher.search(&query, &TopDocs::with_limit(limit as usize).order_by_score()).map_err(native_error)?;
    docs.into_iter().map(|(score, address)| {
        let document = searcher.doc::<TantivyDocument>(address).map_err(native_error)?;
        Ok(Hit { score: score as f64, document: document.to_json(&schema) })
    }).collect()
}

#[napi]
pub struct SearchIndex {
    index: Index,
    reader: IndexReader,
    writer: Option<IndexWriter>,
    closed: bool,
}

#[napi]
impl SearchIndex {
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self> {
        if path.trim().is_empty() { return Err(Error::new(Status::InvalidArg, "path cannot be empty")); }
        std::fs::create_dir_all(&path).map_err(native_error)?;
        let mut schema = Schema::builder();
        schema.add_text_field("id", STRING | STORED);
        schema.add_text_field("title", TEXT | STORED);
        schema.add_text_field("body", TEXT | STORED);
        let index = if std::path::Path::new(&path).join("meta.json").exists() {
            Index::open_in_dir(&path).map_err(native_error)?
        } else { Index::create_in_dir(&path, schema.build()).map_err(native_error)? };
        let writer = index.writer(50_000_000).map_err(native_error)?;
        let reader = index.reader_builder().reload_policy(ReloadPolicy::Manual).try_into().map_err(native_error)?;
        Ok(Self { index, reader, writer: Some(writer), closed: false })
    }

    #[napi]
    pub fn upsert(&mut self, id: String, title: String, body: String) -> Result<()> {
        if id.trim().is_empty() { return Err(Error::new(Status::InvalidArg, "id cannot be empty")); }
        let writer = self.writer.as_mut().ok_or_else(|| Error::new(Status::GenericFailure, "index is closed"))?;
        let schema = self.index.schema();
        let id_field = schema.get_field("id").map_err(native_error)?;
        writer.delete_term(Term::from_field_text(id_field, &id));
        writer.add_document(doc!(id_field => id, schema.get_field("title").map_err(native_error)? => title, schema.get_field("body").map_err(native_error)? => body)).map_err(native_error)?;
        Ok(())
    }

    #[napi]
    pub fn commit(&mut self) -> Result<()> {
        self.writer.as_mut().ok_or_else(|| Error::new(Status::GenericFailure, "index is closed"))?.commit().map_err(native_error)?;
        self.reader.reload().map_err(native_error)
    }

    #[napi]
    pub fn query(&self, query: String, limit: u32) -> Result<Vec<Hit>> {
        if self.closed { return Err(Error::new(Status::GenericFailure, "index is closed")); }
        search(&self.index, &self.reader, &query, limit)
    }

    #[napi]
    pub fn query_async(&self, query: String, limit: u32, repetitions: u32) -> Result<AsyncTask<SearchTask>> {
        if self.closed { return Err(Error::new(Status::GenericFailure, "index is closed")); }
        if repetitions == 0 || repetitions > 100_000 { return Err(Error::new(Status::InvalidArg, "invalid repetitions")); }
        Ok(AsyncTask::new(SearchTask { index: self.index.clone(), reader: self.reader.clone(), query, limit, repetitions }))
    }

    #[napi]
    pub fn close(&mut self) -> Result<()> {
        if let Some(writer) = self.writer.take() { writer.wait_merging_threads().map_err(native_error)?; }
        self.closed = true;
        Ok(())
    }
}

pub struct SearchTask { index: Index, reader: IndexReader, query: String, limit: u32, repetitions: u32 }

#[napi]
impl Task for SearchTask {
    type Output = Vec<Hit>;
    type JsValue = Vec<Hit>;
    fn compute(&mut self) -> Result<Self::Output> {
        let mut hits = Vec::new();
        for _ in 0..self.repetitions { hits = search(&self.index, &self.reader, &self.query, self.limit)?; }
        Ok(hits)
    }
    fn resolve(&mut self, _: Env, output: Self::Output) -> Result<Self::JsValue> { Ok(output) }
}
