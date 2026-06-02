"use client";

import { useEffect, useRef, useState } from "react";
import { ActionIcon, Badge, Loader, Paper, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconX } from "@tabler/icons-react";

type SearchResult = {
  paragraphId: string;
  chapterId: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  paragraphNumber: number;
  excerpt: string;
  isAccepted: boolean;
};

type Props = {
  bookId: string;
  onNavigate?: (chapterId: string, paragraphId: string) => void;
};

export function ManuscriptSearch({ bookId, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/books/${bookId}/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results || []);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, bookId]);

  function renderExcerpt(excerpt: string) {
    const parts = excerpt.split(/\[\[|\]\]/);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} style={{ background: "#ffe066", borderRadius: 2, padding: "0 2px" }}>
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  return (
    <Stack gap="xs">
      <TextInput
        placeholder="Search manuscript…"
        value={query}
        onChange={(e) => {
          const nextQuery = e.currentTarget.value;
          setQuery(nextQuery);
          if (nextQuery.length < 2) {
            setResults([]);
            setSearched(false);
          }
        }}
        leftSection={loading ? <Loader size="xs" /> : <IconSearch size={16} />}
        rightSection={
          query ? (
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setQuery("")}>
              <IconX size={14} />
            </ActionIcon>
          ) : null
        }
      />
      {searched && results.length === 0 && (
        <Text size="sm" c="dimmed">
          No matches found for &quot;{query}&quot;.
        </Text>
      )}
      {results.map((result) => (
        <Paper
          key={result.paragraphId}
          withBorder
          radius="sm"
          p="sm"
          style={{ cursor: onNavigate ? "pointer" : "default" }}
          onClick={() => onNavigate?.(result.chapterId, result.paragraphId)}
        >
          <Stack gap={4}>
            <Badge size="xs" variant="light" color={result.isAccepted ? "teal" : "gray"}>
              Ch. {result.chapterNumber ?? "?"} {result.chapterTitle ? `— ${result.chapterTitle}` : ""} · ¶{result.paragraphNumber}
              {result.isAccepted ? " · accepted" : ""}
            </Badge>
            <Text size="sm" style={{ lineHeight: 1.6 }}>
              {renderExcerpt(result.excerpt)}
            </Text>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
