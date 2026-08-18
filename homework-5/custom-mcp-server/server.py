"""Custom MCP server built with FastMCP (Homework 5, Task 4).

Exposes the contents of lorem-ipsum.md two ways:

- Resources (URIs Claude can read from):
    lorem://words               -> first 30 words (default)
    lorem://words/{word_count}  -> first {word_count} words
- Tool (an action Claude can call):
    read(word_count: int = 30)  -> same word-limited content

Run over stdio:  python server.py
"""

from pathlib import Path

from fastmcp import FastMCP

DEFAULT_WORD_COUNT = 30
LOREM_FILE = Path(__file__).parent / "lorem-ipsum.md"

mcp = FastMCP("lorem-ipsum")


def read_words(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Return the first `word_count` whitespace-separated words of the file.

    Asking for more words than the file contains returns the whole file.
    """
    if word_count < 1:
        raise ValueError("word_count must be a positive integer")
    words = LOREM_FILE.read_text(encoding="utf-8").split()
    return " ".join(words[:word_count])


@mcp.resource("lorem://words")
def lorem_words_default() -> str:
    """First 30 words of lorem-ipsum.md."""
    return read_words()


@mcp.resource("lorem://words/{word_count}")
def lorem_words(word_count: int) -> str:
    """First `word_count` words of lorem-ipsum.md."""
    return read_words(word_count)


@mcp.tool
def read(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Read the first `word_count` words from lorem-ipsum.md (default 30)."""
    return read_words(word_count)


if __name__ == "__main__":
    mcp.run()
