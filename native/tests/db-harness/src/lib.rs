#![allow(dead_code)]

// Import production code directly so tests cannot drift into a duplicated implementation.
#[path = "../../../src/db.rs"]
mod db;

// Merge-paste is pure and shares the text/image kind constants with the database.
#[path = "../../../src/merge.rs"]
mod merge;
