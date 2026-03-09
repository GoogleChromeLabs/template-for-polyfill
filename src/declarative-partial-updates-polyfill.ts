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
    let depth = 0;
    let startNodeDepth = 0;

    while ((node = walker.nextNode() as Comment)) {
      const data = node.data.trim();

      // CASE 1: We are looking for a simple marker
      if (data.startsWith('?marker')) {
        const isMatch = hash
          ? data.includes(`?marker name="${hash}"`)
          : data === '?marker';

        if (isMatch) {
          // Simple replacement, no range to track
          node.replaceWith(template.content.cloneNode(true));
          template.remove();
          return;
        }
      }
      // CASE 2: We are looking for the start of a range
      if (data.startsWith('?start')) {
        depth++;
        const isMatch = hash
          ? data.includes(`?start name="${hash}"`)
          : data === '?start';

        if (isMatch) {
          // Start of a range found; track it and keep walking
          startNode = node;
          startNodeDepth = depth;
        }
      }
      // CASE 3: We have found the start and are now looking for the end tag
      else if (data.startsWith('?end') && startNode) {
        // Only replace content if we're at a depth of less than or equal to
        // this start tag. We'd only be less than if our start tag was nested
        // in other HTML elements and missing an end tag.
        if (depth <= startNodeDepth) {
          const endNode = node;

          // Remove every sibling from startNode until endNode.
          // If we don't hit the end node, then we'll remove all siblings.
          let current = startNode.nextSibling;
          while (current && current !== endNode) {
            if (current === endNode) {
              endNode.remove();
              break;
            }
            const next = current.nextSibling;
            current.remove();
            current = next;
          }

          // Replace startNode with content and clean up
          startNode.replaceWith(template.content.cloneNode(true));
          template.remove();
          return;
        } else {
          // If we see an end tag but we're at a deeper depth then decrement
          // the depth.
          if (depth > 1) depth--;
          // If we're at a depth < 1, so not covered by previous two cases,
          // then it's a rogue `<?end>` tag, so should just ignore it.
        }
      }
    }

    // If we reach the end and still are depth > 0 then we're missing
    // endNode, but can process the startNode (without removing the missing
    // endNode).
    if (depth > 0 && startNode) {

      // Remove everything between startNode and the closing tag of the element
      let current = startNode.nextSibling;
      while (current) {
        const next = current.nextSibling;
        current.remove();
        current = next;
      }
      startNode.replaceWith(template.content.cloneNode(true));
      template.remove();
    }
  };

  // Handle existing templates in the HTML
  document
    .querySelectorAll('template[for]')
    .forEach((t) => processTemplate(t as HTMLTemplateElement));

  // Watch for, and handle newly, insert templates or markers in the HTML
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLTemplateElement && node.hasAttribute('for')) {
          // New template - process that
          processTemplate(node);
        } else if (node instanceof HTMLElement && node.hasAttribute('marker')) {
          // New marker - process any previously inserted templates for it
          document.querySelectorAll('template[for]').forEach((t) => {
            processTemplate(t as HTMLTemplateElement);
          });
        }
      }
    }
  });
  observer.observe(document.body, {childList: true, subtree: true});
})();
