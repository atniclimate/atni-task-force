"""A parsed view of a page, so tests read structure and figures and copy or markup polish does not fail them."""
from html.parser import HTMLParser
import re

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
NUMBER = re.compile(r"\d(?:[\d,.]*\d)?")


def numbers(text):
    """The figures in a sentence, in order; the words around them are free to change."""
    return NUMBER.findall(text)


class Node:
    def __init__(self, tag=None, attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def walk(self):
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.walk()

    def matches(self, tag, cls, attrs):
        if tag and self.tag != tag:
            return False
        if cls and not set(cls.split()) <= set((self.attrs.get("class") or "").split()):
            return False
        for name, want in attrs.items():
            name = name.replace("_", "-")
            if name not in self.attrs or (want is not True and self.attrs[name] != want):
                return False
        return True

    def all(self, tag=None, cls=None, **attrs):
        """Every descendant matching; a keyword value of True only asks that the attribute be there (data_row is data-row)."""
        return [node for node in self.walk() if node.matches(tag, cls, attrs)]

    def one(self, tag=None, cls=None, **attrs):
        found = self.all(tag, cls, **attrs)
        assert found, f"no element with tag={tag} class={cls} {attrs}"
        return found[0]

    def text(self):
        """The reader's words: entities decoded, spaces collapsed, script and style left out."""
        def pieces(node):
            for child in node.children:
                if isinstance(child, str):
                    yield child
                elif child.tag not in ("script", "style"):
                    yield from pieces(child)
        return " ".join("".join(pieces(self)).split())

    def texts(self, tag=None, cls=None, **attrs):
        return [node.text() for node in self.all(tag, cls, **attrs)]

    def style(self):
        """The inline style as a dict, so spacing in the attribute does not matter."""
        pairs = (part.split(":", 1) for part in (self.attrs.get("style") or "").split(";") if ":" in part)
        return {name.strip(): value.strip() for name, value in pairs}


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for depth in range(len(self.stack) - 1, 0, -1):
            if self.stack[depth].tag == tag:
                del self.stack[depth:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse(html):
    parser = _Parser()
    parser.feed(html)
    parser.close()
    return parser.root
