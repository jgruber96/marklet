import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, X } from "lucide-react";
import { baseName } from "../paths";

/** One matching line, as returned by the `search_folder` command. */
export interface SearchHit {
  path: string;
  /** 0-based line and column of the match in the file. */
  line: number;
  column: number;
  /** The matching line, shortened around the match, and where the match sits in it. */
  text: string;
  start: number;
  length: number;
}

interface FolderSearchProps {
  root: string | null;
  /** Changes each time the app asks for the search box (Find in Folder). */
  focusRequest: number;
  onOpenHit(hit: SearchHit): void;
  /** The file tree, shown while nothing is being searched for. */
  children: ReactNode;
}

const MIN_QUERY = 2;
const MAX_HITS = 500;

/** A search box over the open folder; its results take the place of the file tree. */
export function FolderSearch({ root, focusRequest, onOpenHit, children }: FolderSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusRequest) return;
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);

  const term = query.trim();
  useEffect(() => {
    if (!root || term.length < MIN_QUERY) return setHits(null);
    let stale = false;
    const timer = window.setTimeout(async () => {
      const found = await invoke<SearchHit[]>("search_folder", { root, query: term }).catch(() => []);
      if (!stale) setHits(found);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [root, term]);

  if (!root) return <>{children}</>;

  const files: { path: string; hits: SearchHit[] }[] = [];
  for (const hit of hits ?? []) {
    const last = files[files.length - 1];
    if (last?.path === hit.path) last.hits.push(hit);
    else files.push({ path: hit.path, hits: [hit] });
  }
  const count = hits?.length ?? 0;

  return (
    <>
      <div className="side-search">
        <Search size={13} aria-hidden />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Search in folder"
          aria-label="Search in folder"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits?.length) onOpenHit(hits[0]);
            else if (e.key === "Escape" && query) {
              // First Escape clears the search; the next one goes back to the editor.
              e.stopPropagation();
              setQuery("");
            }
          }}
        />
        {query && (
          <button className="icon-btn" aria-label="Clear search" title="Clear search" onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        )}
      </div>
      {hits === null ? (
        term.length > 0 && term.length < MIN_QUERY ? (
          <div className="side-empty">Type at least {MIN_QUERY} characters.</div>
        ) : (
          children
        )
      ) : (
        <div className="search-results">
          <div className="search-summary" role="status">
            {count === 0
              ? "No matches."
              : `${count >= MAX_HITS ? `First ${MAX_HITS}` : count} ${count === 1 ? "match" : "matches"} in ${files.length} ${files.length === 1 ? "file" : "files"}`}
          </div>
          {files.map((file) => (
            <div key={file.path} className="search-group">
              <div className="search-file" title={file.path}>
                {baseName(file.path)}
              </div>
              {file.hits.map((hit) => (
                <button key={`${hit.line}:${hit.column}`} className="search-hit" title={hit.text} onClick={() => onOpenHit(hit)}>
                  <span className="search-line">{hit.line + 1}</span>
                  <span className="search-text">
                    {hit.text.slice(0, hit.start)}
                    <mark>{hit.text.slice(hit.start, hit.start + hit.length)}</mark>
                    {hit.text.slice(hit.start + hit.length)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
