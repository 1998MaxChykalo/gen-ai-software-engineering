"""Tests for the lorem-ipsum FastMCP server.

Covers the word-limiting logic directly and the MCP surface (resource +
`read` tool) through an in-memory FastMCP client — the same protocol path
a real MCP client like Claude Code uses, minus the stdio transport.
"""

import sys
from pathlib import Path

import pytest
from fastmcp import Client

sys.path.insert(0, str(Path(__file__).parent.parent))
from server import DEFAULT_WORD_COUNT, LOREM_FILE, mcp, read_words

TOTAL_WORDS = len(LOREM_FILE.read_text(encoding="utf-8").split())


class TestReadWords:
    def test_default_returns_30_words(self):
        assert len(read_words().split()) == DEFAULT_WORD_COUNT

    def test_custom_count(self):
        assert len(read_words(5).split()) == 5

    def test_words_come_from_the_file_in_order(self):
        expected = LOREM_FILE.read_text(encoding="utf-8").split()[:7]
        assert read_words(7).split() == expected

    def test_count_larger_than_file_returns_whole_file(self):
        assert len(read_words(10_000).split()) == TOTAL_WORDS

    @pytest.mark.parametrize("bad", [0, -1])
    def test_non_positive_count_rejected(self, bad):
        with pytest.raises(ValueError):
            read_words(bad)


class TestMcpSurface:
    async def test_read_tool_default(self):
        async with Client(mcp) as client:
            result = await client.call_tool("read", {})
        assert len(result.data.split()) == DEFAULT_WORD_COUNT

    async def test_read_tool_custom_count(self):
        async with Client(mcp) as client:
            result = await client.call_tool("read", {"word_count": 12})
        assert len(result.data.split()) == 12

    async def test_read_tool_is_listed(self):
        async with Client(mcp) as client:
            tools = await client.list_tools()
        assert "read" in [t.name for t in tools]

    async def test_default_resource(self):
        async with Client(mcp) as client:
            contents = await client.read_resource("lorem://words")
        assert len(contents[0].text.split()) == DEFAULT_WORD_COUNT

    async def test_templated_resource(self):
        async with Client(mcp) as client:
            contents = await client.read_resource("lorem://words/8")
        assert len(contents[0].text.split()) == 8

    async def test_tool_and_resource_return_same_content(self):
        async with Client(mcp) as client:
            tool_result = await client.call_tool("read", {"word_count": 15})
            resource = await client.read_resource("lorem://words/15")
        assert tool_result.data == resource[0].text
