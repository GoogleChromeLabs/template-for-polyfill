/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

(() => {
  // Only process the polyfill if needed
  if ('marker' in Element.prototype) return;

  console.log('Loading declarative partial updates polyfill...');

  const processTemplate = (template: HTMLTemplateElement) => {
    const [name, hash] = template.getAttribute('for')?.split('#') || [];
    const section = document.querySelector(`section[marker="${name}"]`);

    if (!section) return;

    // We use a Treewalker instead of regular query selectors to
    const walker = document.createTreeWalker(
      section,
      // Processing Instructions usually are comments in non-supporting
      // browser, but also handle the case of actual Processing Instructions
      // in case browsers ever introduce them for other reasons
      NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION
    );

    let startNode: Comment | null = null;
    let node: Comment | null;

    while ((node = walker.nextNode() as Comment)) {
      const data = node.data.trim();

      // CASE 1: We are looking for the start of a range or a simple marker
      if (!startNode) {
        const isMatch = hash
          ? (data.includes(`?start name="${hash}"`) || data.includes(`?marker name="${hash}"`))
          : (data === '?start' || data === '?marker');

        if (isMatch) {
          if (data.includes('?marker')) {
            // Simple replacement, no range to track
            node.replaceWith(template.content.cloneNode(true));
            template.remove();
            return;
          } else {
            // Start of a range found; track it and keep walking
            startNode = node;
          }
        }
      }
      // CASE 2: We have found the start and are now looking for the end tag
      else if (data.startsWith('?end')) {
        const endNode = node;

        // Remove everything between startNode and endNode
        let current = startNode.nextSibling;
        while (current && current !== endNode) {
          const next = current.nextSibling;
          current.remove();
          current = next;
        }

        // Replace startNode with content and clean up
        startNode.replaceWith(template.content.cloneNode(true));
        endNode.remove();
        template.remove();
        return;
      }
    }
  };

  // Handle existing templates in the HTML
  document.querySelectorAll('template[for]').forEach(t => processTemplate(t as HTMLTemplateElement));

  // Watch for, a handle newly insert templates in the HTML
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLTemplateElement && node.hasAttribute('for')) {
          processTemplate(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
