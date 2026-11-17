export function hasLitPartMarkers(root: Node): boolean {
  for (const node of root.childNodes) {
    if (node.nodeType === Node.COMMENT_NODE && (node.textContent ?? '').startsWith('lit-part')) {
      return true;
    }
  }
  return false;
}
