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

    // Handle streaming parser.
    //
    // If the document is still loading and either the template or the marker
    // is the last element in the DOM then it may be incomplete. Wait for the
    // next element OR the end of the HTML to be reached and only then continue.
    // Prefer readystatechange over DOMContentLoaded so we can start earlier
    //
    // Note this assumes templates (or markers) elements are not streamed in by
    // scripts and only inserted atomically.
    if (
      document.readyState == 'loading' &&
      !(template.nextElementSibling && markerElement.nextElementSibling)
    ) {
      let mutationObserver: MutationObserver;

      // Make sure to tidy up after ourselves if one runs.
      const processAndCleanup = () => {
        mutationObserver?.disconnect();
        document.removeEventListener('readystatechange', handleStateChange);
        processTemplate(template);
      };

      mutationObserver = new MutationObserver(() => {
        // Only process if both template and marker are not the last elements
        if (template.nextElementSibling && markerElement.nextElementSibling) {
          processAndCleanup;
        }
      });
      mutationObserver.observe(document, {childList: true, subtree: true});

      const handleStateChange = () => {
        // Only process if end of HTML reached
        if (document.readyState === 'interactive') {
          processAndCleanup();
        }
      };
      document.addEventListener('readystatechange', handleStateChange);

      // For now end processTemplate and let one of above handle this.
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

    let startNode: Node | null = null;
    let node: Node | null;
    let depth = 0;
    let startNodeDepth = 0;

    const replaceContentWithTemplate = (
      type: string,
      templateNode: HTMLTemplateElement,
      startNode: Node,
      endNode: Node | null = null
    ): void => {
      if (type !== 'marker') {
        // Remove every sibling from startNode until endNode.
        // If we don't hit the end node, then we'll remove all siblings.
        let current = startNode.nextSibling;
        while (current) {
          if (current === endNode) {
            current.remove();
            break;
          }
          const next = current.nextSibling;
          current.remove();
          current = next;
        }
      }
      (startNode as HTMLElement).replaceWith(template.content.cloneNode(true));
      templateNode.remove();
    };

    while ((node = walker.nextNode())) {
      let data: string | null;

      if (node.nodeType === Node.COMMENT_NODE) {
        // Processing Instructions are usually handled as comments if patching
        // is not supported. Patching adds Processing Instructions to HTML for
        // the first time.
        data = (node as Comment).data;
      } else if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        // If the browser supports processing instructions but not patching
        // (currently no browsers support this, but never say never!)
        // then they are in a slightly different format to comments so reformat
        // them to be the same to make later processing easier.
        data = `?${(node as ProcessingInstruction).target}`;
        if ((node as ProcessingInstruction).data) data = `${data} ${(node as ProcessingInstruction).data}`;
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
          replaceContentWithTemplate('marker', template, node);
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
          // Check if the endNode is for this one (it might be missing)
          const endNode = startNode.parentElement === node.parentElement ? node : null;
          replaceContentWithTemplate(
            'range',
            template,
            startNode,
            endNode
          );
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

    // If we reach the end of the TreeWalker and still are depth > 0 then we're
    // missing endNode, but can process the startNode (without removing the
    // missing endNode).
    if (depth > 0 && startNode) {
      // Remove everything between startNode and the closing tag of the element
      replaceContentWithTemplate('range', template, startNode);
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
