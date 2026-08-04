"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export default function SqlEditor({ value, onChange, label }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onDocumentChange = useEffectEvent((nextValue: string) => onChange(nextValue));

  useEffect(() => {
    if (!containerRef.current) return;

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onDocumentChange(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        sql({ dialect: PostgreSQL }),
        oneDark,
        updateListener,
        EditorView.theme({
          "&": {
            border: "1px solid var(--border)",
            width: "100%",
            minWidth: 0,
            maxWidth: "100%",
          },
          "&.cm-focused": {
            outline: "none",
            borderColor: "var(--accent)",
            boxShadow: "0 0 0 1px var(--accent)",
          },
          ".cm-scroller": {
            minHeight: "240px",
            width: "100%",
            minWidth: 0,
            maxWidth: "100%",
            overflowX: "auto",
            fontFamily: "var(--font-mono)",
            lineHeight: "1.65",
          },
          ".cm-content": {
            minWidth: "100%",
            fontSize: "var(--sql-editor-font-size)",
            padding: "0.75rem 0",
          },
          ".cm-gutters": {
            border: "none",
          },
          ".cm-line": {
            padding: "0 0.75rem",
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div className="w-full min-w-0 max-w-full">
      {label && <label className="block mb-1.5 text-sm text-text-soft">{label}</label>}
      <div ref={containerRef} className="w-full min-w-0 max-w-full" />
    </div>
  );
}
