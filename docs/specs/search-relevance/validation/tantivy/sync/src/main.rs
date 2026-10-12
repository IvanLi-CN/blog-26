use rusqlite::{params, Connection};
use std::{env, path::Path, process::Command};
use tantivy::{collector::{Count, TopDocs}, doc, query::TermQuery, schema::*, Index, IndexReader, IndexWriter, ReloadPolicy, Term};

fn schema() -> Schema {
    let mut b = Schema::builder();
    b.add_text_field("id", STRING | STORED);
    b.add_text_field("body", TEXT | STORED);
    b.add_text_field("tags", TEXT | STORED);
    b.add_text_field("slug", STRING | STORED);
    b.add_text_field("kind", STRING | STORED);
    b.add_u64_field("version", STORED);
    b.build()
}
fn count(r: &IndexReader, field: Field, value: &str) -> usize {
    r.searcher().search(&TermQuery::new(Term::from_field_text(field, value), IndexRecordOption::Basic), &Count).unwrap()
}
fn pass(name: &str) { println!("PASS {name}"); }
fn checkpoint(c: &Connection) -> i64 { c.query_row("SELECT seq FROM checkpoint", [], |r| r.get(0)).unwrap() }
fn watermark(c: &Connection) -> i64 { c.query_row("SELECT coalesce(max(seq),0) FROM outbox", [], |r| r.get(0)).unwrap() }
fn apply(c: &Connection, w: &mut IndexWriter, s: &Schema, from: i64) -> i64 {
    let mut q = c.prepare("SELECT seq,id FROM outbox WHERE seq>? ORDER BY seq").unwrap();
    let events: Vec<(i64,String)> = q.query_map([from], |r| Ok((r.get(0)?,r.get(1)?))).unwrap().map(Result::unwrap).collect();
    let mut high = from;
    for (seq,id) in events {
        w.delete_term(Term::from_field_text(s.get_field("id").unwrap(), &id));
        let row = c.query_row("SELECT body,tags,slug,kind,version FROM posts WHERE id=?", [&id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,i64>(4)?)));
        if let Ok((body,tags,slug,kind,v)) = row {
            let v=u64::try_from(v).expect("SQLite version must be nonnegative");
            w.add_document(doc!(s.get_field("id").unwrap()=>id, s.get_field("body").unwrap()=>body, s.get_field("tags").unwrap()=>tags, s.get_field("slug").unwrap()=>slug, s.get_field("kind").unwrap()=>kind,s.get_field("version").unwrap()=>v)).unwrap();
        }
        high = seq;
    }
    high
}
fn sync(c: &Connection,w: &mut IndexWriter,s: &Schema) {
    let high=apply(c,w,s,checkpoint(c));
    // This ordering is project-owned: commit errors must leave checkpoint unchanged.
    w.commit().unwrap();
    c.execute("UPDATE checkpoint SET seq=?",[high]).unwrap();
}
fn main() {
    let args:Vec<String>=env::args().collect();
    if args.get(1).map(String::as_str)==Some("committed-child") {
        let index=Index::open_in_dir(&args[2]).unwrap();let c=Connection::open(&args[3]).unwrap();
        let mut w:IndexWriter=index.writer(15_000_000).unwrap();apply(&c,&mut w,&index.schema(),checkpoint(&c));w.commit().unwrap();
        std::process::exit(77);
    }
    if args.get(1).map(String::as_str)==Some("uncommitted-child") {
        let index=Index::open_in_dir(&args[2]).unwrap();
        let s=index.schema(); let mut w:IndexWriter=index.writer(15_000_000).unwrap();
        w.add_document(doc!(s.get_field("id").unwrap()=>"uncommitted",s.get_field("body").unwrap()=>"terminated")).unwrap();
        // exit bypasses writer Drop; parent verifies persistent state after process termination.
        std::process::exit(77);
    }
    println!("ENV probe={} tantivy=0.26.2 (workspace exact dependency pin) rusqlite=0.40.2 (bundled) sqlite_runtime={}",env!("CARGO_PKG_VERSION"),rusqlite::version());
    let temp=tempfile::tempdir().unwrap(); let dir=temp.path().join("index"); std::fs::create_dir(&dir).unwrap();
    let c=Connection::open(temp.path().join("source.sqlite")).unwrap();
    c.execute_batch("CREATE TABLE posts(id TEXT PRIMARY KEY,body TEXT,tags TEXT,slug TEXT,kind TEXT,public INTEGER,draft INTEGER,version INTEGER); CREATE TABLE outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT,op TEXT); CREATE TABLE checkpoint(seq INTEGER); INSERT INTO checkpoint VALUES(0); CREATE TRIGGER ai AFTER INSERT ON posts BEGIN INSERT INTO outbox(id,op) VALUES(new.id,'upsert'); END; CREATE TRIGGER au AFTER UPDATE ON posts BEGIN INSERT INTO outbox(id,op) VALUES(new.id,'upsert'); END; CREATE TRIGGER ad AFTER DELETE ON posts BEGIN INSERT INTO outbox(id,op) VALUES(old.id,'delete'); END;").unwrap();
    let s=schema(); let index=Index::create_in_dir(&dir,s.clone()).unwrap(); let mut w:IndexWriter=index.writer(15_000_000).unwrap();
    let r=index.reader_builder().reload_policy(ReloadPolicy::Manual).try_into().unwrap();
    let id=s.get_field("id").unwrap(); let body=s.get_field("body").unwrap();
    c.execute("INSERT INTO posts VALUES('a','alpha','oldtag','same','post',1,0,1)",[]).unwrap();
    sync(&c,&mut w,&s); assert_eq!(count(&r,id,"a"),0); r.reload().unwrap(); assert_eq!(count(&r,id,"a"),1); pass("insert; manual reader reload controls visibility");
    c.execute_batch("BEGIN; INSERT INTO posts VALUES('rollback','ghost','','ghost','memo',1,0,1); ROLLBACK;").unwrap(); assert_eq!(watermark(&c),1); pass("SQLite rollback removes transaction-local outbox event");
    c.execute("UPDATE posts SET body='beta',tags='newtag',slug='renamed',kind='memo',version=2 WHERE id='a'",[]).unwrap(); sync(&c,&mut w,&s);r.reload().unwrap(); assert_eq!(count(&r,body,"alpha"),0);assert_eq!(count(&r,body,"beta"),1);assert_eq!(count(&r,s.get_field("tags").unwrap(),"newtag"),1);assert_eq!(count(&r,s.get_field("slug").unwrap(),"renamed"),1);assert_eq!(count(&r,s.get_field("kind").unwrap(),"memo"),1);pass("body/tag/slug/type projection updates replace stable id");
    c.execute("UPDATE posts SET public=0,draft=1,version=3 WHERE id='a'",[]).unwrap();assert!(watermark(&c)>checkpoint(&c));assert_eq!(count(&r,body,"beta"),1);
    let hits=r.searcher().search(&TermQuery::new(Term::from_field_text(id,"a"),IndexRecordOption::Basic),&TopDocs::with_limit(1).order_by_score()).unwrap();
    let candidate:TantivyDocument=r.searcher().doc(hits[0].1).unwrap();let indexed_version=candidate.get_first(s.get_field("version").unwrap()).unwrap().as_u64().unwrap();assert_eq!(indexed_version,2);
    let sql_indexed_version=i64::try_from(indexed_version).expect("indexed version must fit SQLite signed integer");
    let allowed:bool=c.query_row("SELECT public=1 AND draft=0 AND version=? FROM posts WHERE id='a'",[sql_indexed_version],|q|q.get(0)).unwrap();assert!(!allowed);pass("stale stored index version detected; authoritative pre-return/pre-LLM visibility+version guard rejects candidate");
    let before=checkpoint(&c);let high=apply(&c,&mut w,&s,before);assert_eq!(checkpoint(&c),before);w.rollback().unwrap();assert_eq!(checkpoint(&c),before);pass("aborted pre-commit batch cannot advance checkpoint");
    assert!(high>before);drop(w);
    let crashed=Command::new(env::current_exe().unwrap()).arg("committed-child").arg(&dir).arg(temp.path().join("source.sqlite")).status().unwrap();assert_eq!(crashed.code(),Some(77));assert_eq!(checkpoint(&c),before);r.reload().unwrap();
    let hits=r.searcher().search(&TermQuery::new(Term::from_field_text(id,"a"),IndexRecordOption::Basic),&TopDocs::with_limit(1).order_by_score()).unwrap();let committed:TantivyDocument=r.searcher().doc(hits[0].1).unwrap();assert_eq!(committed.get_first(s.get_field("version").unwrap()).unwrap().as_u64(),Some(3));
    let mut w:IndexWriter=index.writer(15_000_000).unwrap();sync(&c,&mut w,&s);r.reload().unwrap();assert_eq!(count(&r,id,"a"),1);assert_eq!(checkpoint(&c),high);pass("process exit after commit before checkpoint: committed version persists and replay is idempotent");
    apply(&c,&mut w,&s,0);w.commit().unwrap();r.reload().unwrap();assert_eq!(count(&r,id,"a"),1);pass("duplicate upsert replay remains one live document");
    c.execute("UPDATE posts SET public=1,draft=0,version=4 WHERE id='a'",[]).unwrap();sync(&c,&mut w,&s);r.reload().unwrap();
    let restored:bool=c.query_row("SELECT public=1 AND draft=0 AND version=4 FROM posts WHERE id='a'",[],|q|q.get(0)).unwrap();assert!(restored);assert_eq!(checkpoint(&c),watermark(&c));pass("private-to-public restoration reaches requested watermark");
    c.execute("INSERT INTO posts VALUES('other','gamma','tag','renamed','post',1,0,1)",[]).unwrap();sync(&c,&mut w,&s);r.reload().unwrap();assert_eq!(count(&r,s.get_field("slug").unwrap(),"renamed"),2);assert_eq!(count(&r,id,"a"),1);assert_eq!(count(&r,id,"other"),1);pass("same slug across types retains separate stable ids");
    assert!(index.writer::<TantivyDocument>(15_000_000).is_err());pass("second writer rejected by engine directory lock");
    c.execute("DELETE FROM posts WHERE id='a'",[]).unwrap();sync(&c,&mut w,&s);apply(&c,&mut w,&s,0);w.commit().unwrap();r.reload().unwrap();assert_eq!(count(&r,id,"a"),0);pass("delete and duplicate delete replay");
    c.execute("DELETE FROM posts WHERE id='other'",[]).unwrap();sync(&c,&mut w,&s);
    for n in 0..20 {c.execute("INSERT INTO posts VALUES(?,'bulk','tag',?,'memo',1,0,1)",params![format!("b{n}"),format!("b{n}")]).unwrap();}sync(&c,&mut w,&s);r.reload().unwrap();assert_eq!(r.searcher().num_docs(),20);
    c.execute("DELETE FROM posts",[]).unwrap();sync(&c,&mut w,&s);r.reload().unwrap();assert_eq!(r.searcher().num_docs(),0);pass("bulk clear publishes all deletions");
    c.execute("INSERT INTO posts VALUES('rebuild','committed','tag','rebuild','post',1,0,1)",[]).unwrap();w.delete_all_documents().unwrap();apply(&c,&mut w,&s,0);w.commit().unwrap();c.execute("UPDATE checkpoint SET seq=?",[watermark(&c)]).unwrap();r.reload().unwrap();assert_eq!(count(&r,id,"rebuild"),1);pass("full rebuild from authoritative current projection");
    drop(w);let status=Command::new(env::current_exe().unwrap()).arg("uncommitted-child").arg(Path::new(&dir)).status().unwrap();assert_eq!(status.code(),Some(77));
    let reopened=Index::open_in_dir(&dir).unwrap();let rr:IndexReader=reopened.reader().unwrap();assert_eq!(count(&rr,id,"uncommitted"),0);assert_eq!(count(&rr,id,"rebuild"),1);let _w:IndexWriter=reopened.writer(15_000_000).unwrap();pass("process termination before commit preserves only previously committed documents and releases writer lock");
    println!("NOT_TESTED machine-power-loss durability; production multiprocess ownership; genuine commit IO failure injection; filesystem/SQLite atomicity; real clipping permission implementation; performance SLA");
}
