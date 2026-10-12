use tantivy::{collector::{DocSetCollector, TopDocs}, doc, query::{Query, QueryParser, PhraseQuery, RegexQuery}, schema::*, tokenizer::{LowerCaser, NgramTokenizer, RegexTokenizer, TextAnalyzer, TokenStream, Tokenizer}, Index, Term};

const DOCS: &[&str] = &["Arch Linux", "Arch-Linux", "中文Arch中文", "archive", "search", "aarch64", "ArchLinux", "arch_linux", "architecture", "这篇文章", "文隔开章", "C", "C++", "C#", "C++17", "Node.js", "Node js", "SQLite", "SQLite3", "ESP32-C3", "archive then Arch", "alpha beta", "beta alpha", "alpha x beta", "alpha enormousgap beta", "abcXYZdef", "defXYZabc", "abc def", "abcXdef", "abcXXdef", "甲乙丙丁戊己", "甲乙丙中间丁戊己", "丁戊己甲乙丙", "中文Arch-中文SQLite", "中文Arch......SQLite", "Arch中文SQLite", "甲乙丙。丁戊己", "archive archive archive archive archive", "archive archive archive archive", "archive archive archive", "archive archive", "Arch", "文。章", "文 章", "文-章", "alpha", "beta", "gamma"];
fn hits(index: &Index, field: Field, query: &dyn Query) -> Vec<usize> {
    let reader = index.reader().unwrap();
    let searcher = reader.searcher();
    let addresses = searcher.search(query, &DocSetCollector).unwrap();
    let mut ids: Vec<_> = addresses.into_iter().map(|address| {
        let document: TantivyDocument = searcher.doc(address).unwrap();
        document.get_first(field).unwrap().as_u64().unwrap() as usize
    }).collect();
    ids.sort(); ids
}
fn main() -> tantivy::Result<()> {
    println!("tantivy=0.26.2; document ids are zero-based");
    for (id, value) in DOCS.iter().enumerate() { println!("DOC {id} {value:?}"); }
    for name in ["default", "regex", "regexSplitDot", "regexKeepSeparators", "ngram1", "trigram"] {
        let mut builder = Schema::builder();
        let options = TextOptions::default().set_indexing_options(TextFieldIndexing::default().set_tokenizer(name).set_index_option(IndexRecordOption::WithFreqsAndPositions));
        let body = builder.add_text_field("body", options.clone());
        let title = builder.add_text_field("title", options);
        let id = builder.add_u64_field("id", STORED);
        let index = Index::create_in_ram(builder.build());
        match name {
            "regex" => index.tokenizers().register(name, TextAnalyzer::builder(RegexTokenizer::new(r"[A-Za-z0-9_+#]+(?:\.[A-Za-z0-9_+#]+)*|[\p{Han}]")?).filter(LowerCaser).build()),
            "regexSplitDot" => index.tokenizers().register(name, TextAnalyzer::builder(RegexTokenizer::new(r"[A-Za-z0-9_+#]+|[\p{Han}]")?).filter(LowerCaser).build()),
            "regexKeepSeparators" => index.tokenizers().register(name, TextAnalyzer::builder(RegexTokenizer::new(r"[A-Za-z0-9_+#]+|(?s:.)")?).filter(LowerCaser).build()),
            "ngram1" => index.tokenizers().register(name, TextAnalyzer::builder(NgramTokenizer::new(1,1,false)?).filter(LowerCaser).build()),
            "trigram" => index.tokenizers().register(name, TextAnalyzer::builder(NgramTokenizer::new(3,3,false)?).filter(LowerCaser).build()),
            _ => (),
        }
        let mut analyzer = index.tokenizers().get(name).unwrap();
        for value in ["中文Arch中文", "arch_linux", "C C++ C# C++17", "Node.js Node js", "这篇文章", "abcXYZdef"] {
            let mut stream = analyzer.token_stream(value);
            let mut tokens = Vec::new();
            while stream.advance() { let token = stream.token(); tokens.push(format!("{}@{}:{}..{}", token.text, token.position, token.offset_from, token.offset_to)); }
            println!("TOKENS {name} {value:?} {tokens:?}");
        }
        let mut writer = index.writer(20_000_000)?;
        for (number, value) in DOCS.iter().enumerate() { writer.add_document(doc!(id=>number as u64, body=>*value, title=>if number==0 { "title-only" } else { "other" }))?; }
        writer.commit()?;
        let mut parser = QueryParser::for_index(&index, vec![body]);
        parser.set_conjunction_by_default();
        for raw in ["Arch", "\"Arch\"", "body:Arch", "arch*", "\"arch\"*", "文章", "\"文章\"", "C", "C++", "C#", "\"C++\"", "Node.js", "\"Node.js\"", "Node", "SQLite", "SQLite3", "C++17", "ESP32", "title:Arch", "body:\"文章\"", "\"alpha beta\"", "alpha beta", "alpha AND beta", "alpha OR beta", "alpha NOT beta", "title:title-only", "NEAR(alpha beta, 1)"] {
            match parser.parse_query(raw) { Ok(query) => {
                let actual = hits(&index,id,&*query);
                println!("QUERY {name} {raw:?} {actual:?} AST {query:?}");
                if raw == "Arch" {
                    let reader = index.reader()?;
                    let searcher = reader.searcher();
                    let top = searcher.search(&*query, &TopDocs::with_limit(3).order_by_score())?;
                    let top_ids: Vec<_> = top.into_iter().map(|(_,address)| { let document: TantivyDocument = searcher.doc(address).unwrap(); document.get_first(id).unwrap().as_u64().unwrap() as usize }).collect();
                    let valid_ids = [0,1,2,20,33,34,35,41];
                    let valid_in_top: Vec<_> = top_ids.iter().filter(|id|valid_ids.contains(id)).collect();
                    println!("TRUNCATION {name} top3={top_ids:?} valid_in_top3={valid_in_top:?} full_expected={valid_ids:?}; this intersection is diagnostic only, not an implementation");
                }
                let expected: Option<Vec<usize>> = match raw {
                    "Arch" | "\"Arch\"" | "body:Arch" => Some(vec![0,1,2,20,33,34,35,41]),
                    "文章" | "\"文章\"" => Some(vec![9]),
                    "C" => Some(vec![11]), "C++" | "\"C++\"" => Some(vec![12]), "C#" => Some(vec![13]),
                    "Node.js" | "\"Node.js\"" => Some(vec![15]), "Node" => Some(vec![15,16]), "SQLite" => Some(vec![17,33,34,35]),
                    "alpha beta" | "alpha AND beta" => Some(vec![21,22,23,24]),
                    "\"alpha beta\"" => Some(vec![21]), "alpha NOT beta" => Some(vec![45]),
                    "alpha OR beta" => Some(vec![21,22,23,24,45,46]),
                    "title:title-only" => Some(vec![0]), "title:Arch" => Some(vec![]),
                    "body:\"文章\"" => Some(vec![9]), "ESP32" => Some(vec![19]),
                    "C++17" => Some(vec![14]), "SQLite3" => Some(vec![18]),
                    _ => None,
                };
                if let Some(expected) = expected { println!("ASSERT {name} {raw:?} expected={expected:?} actual={actual:?} {}", if expected==actual {"PASS"} else {"FAIL"}); }
            }, Err(error) => println!("QUERY_ERROR {name} {raw:?} {error}"), }
        }
        let prefix = RegexQuery::from_pattern("arch.*", body).unwrap();
        println!("BUILTIN_REGEX_PREFIX {name} expected=[0,1,2,3,6,7,8,20,33,34,35,37,38,39,40,41] actual={:?}", hits(&index,id,&prefix));
        for (a,b) in [("alpha","beta"),("abc","def"),("甲乙丙","丁戊己"),("arch","sqlite"),("文","章")] {
            for slop in [0,1,2,3,4,8,16] {
                let mut phrase = PhraseQuery::new(vec![Term::from_field_text(body,a),Term::from_field_text(body,b)]);
                phrase.set_slop(slop);
                println!("PHRASE {name} {a}/{b} slop={slop} {:?}", hits(&index,id,&phrase));
            }
        }
    }
    Ok(())
}
