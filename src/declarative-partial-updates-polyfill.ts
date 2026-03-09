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
    const markerElement = document.querySelector(`[marker="${name}"]`);

    if (!markerElement) return;

    // If the document is still loading and either the template or the marker
    // is the last element in the DOM then it may be incomplete. Wait for the
    // next element or Loaded and only then continue.
    // Note this assumes templates (or markers) are not streamed in after DCL
    // and only inserted atomically. TBC.
    if (
      document.readyState == 'loading' &&
      !(template.nextElementSibling && markerElement.nextElementSibling)
    ) {
      const mutationObserver = new MutationObserver((_, obs) => {
        if (template.nextElementSibling && markerElement.nextElementSibling) {
          processTemplate(template);
          obs.disconnect();
        }
      });
      mutationObserver.observe(document, {childList: true, subtree: true});

      document.addEventListener('DOMContentLoaded', () => {
        mutationObserver.disconnect();
        processTemplate(template);
      }, { once: true});
      // For now end processing
      return;
    }

    // We use a TreeWalker instead of regular query selectors to
    // handle comments and processing instructions
    const walker = document.createTreeWalker(
      markerElement,
      // Processing Instructions usually are comments in non-supporting
      // browser, but also handle the case of actual Processing Instructions
      // in case browsers ever introduce them for other reasons
      NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION
    );

    let startNode: Comment | ProcessingInstruction | null = null;
    let node: Node | null;
    let depth = 0;
    let startNodeDepth = 0;

    while ((node = walker.nextNode())) {
      let castNode: Comment | ProcessingInstruction | null;
      let data: string | null;

      if (node.nodeType === Node.COMMENT_NODE) {
        castNode = node as Comment;
        data = castNode.data;
      } else if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        // If the browser supports processing instructions but not markers
        // then they are in a slightly different format to comments so reformat
        // them to be the same to make later processing easier.
        castNode = node as ProcessingInstruction;
        data = `?${(node as ProcessingInstruction).target}`;
        if (castNode.data) data = `${data} ${castNode.data}`;
      } else {
        // Shouldn't reach here but needed to keep Typescript happy
        continue;
      }

      // CASE 1: We are looking for a simple marker
      if (data.startsWith('?marker')) {
        const isMatch = hash
          ? data.includes(`?marker name="${hash}"`)
          : data === '?marker';

        if (isMatch) {
          // Simple replacement, no range to track
          castNode.replaceWith(template.content.cloneNode(true));
          template.remove();
          return;
        }
      }
      // CASE 2: We are looking for the start of a range
      if (data.startsWith('?start')) {
        depth++;
        // Only match if we haven't already got a startNode
        // to handle duplicate names
        const isMatch =
          !startNode && hash
            ? data.includes(`?start name="${hash}"`)
            : data === '?start';

        if (isMatch) {
          // Start of a range found; track it and keep walking
          startNode = castNode;
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
              castNode.remove();
              break;
            }
            const next = current.nextSibling;
            current.remove();
            current = next;
          }

          // Replace startNode with content and clean up
          castNode.replaceWith(template.content.cloneNode(true));
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
