/**
 *  @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

(() => {
  // Only process the polyfill if needed
  if ('marker' in Element.prototype) return;

  console.log('Loading declarative partial updates polyfill...');

  // Helper function to actually insert the content and cleanup the
  // processing instructions
  const replaceContentWithTemplate = (
    type: string,
    templateNode: HTMLTemplateElement,
    startNode: Node,
    endNode: Node | null = null
  ): void => {
    if (type !== 'marker') {
      // Remove every sibling after the startNode until the endNode.
      // If we don't have an end node, then we'll remove all siblings.
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
    (startNode as HTMLElement).replaceWith(
      templateNode.content.cloneNode(true)
    );
    templateNode.remove();
  };

  const processTemplate = (template: HTMLTemplateElement) => {
    if (!template) return;

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

      // Whichever runs first will cleanups the others and process the template
      // Technically this could run twice if the last mutation is the </html>
      // element but that's fine, the template will just not exist then so not
      // worth implementing a mutex for.
      const processAndCleanup = () => {
        mutationObserver?.disconnect();
        document.removeEventListener('readystatechange', handleStateChange);
        processTemplate(template);
      };

      mutationObserver = new MutationObserver(() => {
        // Only process if both template and marker are not the last elements
        // (or one of them might still be streaming)
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

      // For now end and let one of above handle this template later.
      return;
    }

    // We use a TreeWalker instead of regular query selectors to
    // handle comments and processing instructions
    const walker = document.createTreeWalker(
      markerElement,
      // Processing Instructions usually are comments in non-supporting
      // browser, but we also handle the case of actual Processing Instructions
      // in case browsers ever introduce them for other reasons.
      NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION
    );

    let node: Node | null;
    let startNode: Node | null = null;
    let depth = 0;
    let startNodeDepth = 0;

    while ((node = walker.nextNode())) {
      let processingInstructionText: string | null = null;

      if (node.nodeType === Node.COMMENT_NODE) {
        // Processing Instructions are usually handled as comments if patching
        // is not supported. Patching adds Processing Instructions to HTML for
        // the first time.
        processingInstructionText = (node as Comment).data;
      } else if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        // If the browser supports processing instructions but not patching
        // (currently no browsers support this, but never say never!)
        // then they are in a slightly different format to comments, so
        // reformat them to be the same to make later processing easier.
        processingInstructionText = `?${(node as ProcessingInstruction).target}`;
        if ((node as ProcessingInstruction).data)
          processingInstructionText = `${processingInstructionText} ${(node as ProcessingInstruction).data}`;
      }

      // We should now have a processingInstruction beginning with `?`
      if (!processingInstructionText || processingInstructionText.length <= 1)
        return;

      // CASE 1: We are looking at a simple marker
      if (processingInstructionText.startsWith('?marker')) {
        // Check if the hash matches (including if there is no hash)
        const isMatch = hash
          ? processingInstructionText.includes(`?marker name="${hash}"`)
          : processingInstructionText === '?marker';

        if (isMatch) {
          // Simple replacement, no range to track
          replaceContentWithTemplate('marker', template, node);
          return;
        }
      }
      // CASE 2: We are looking for the start of a range
      else if (processingInstructionText.startsWith('?start')) {
        depth++;
        // Only match if we haven't already got a startNode
        // to handle duplicate names
        const isMatch =
          !startNode && hash
            ? processingInstructionText.includes(`?start name="${hash}"`)
            : processingInstructionText === '?start';

        if (isMatch) {
          // Start of a range found; track it and keep walking
          startNode = node;
          startNodeDepth = depth;
        }
      }
      // CASE 3: We have found the end tag
      else if (processingInstructionText.startsWith('?end') && startNode) {
        // Only replace content if we're at a depth of less than or equal to
        // this start tag. We'd only be less than if our start tag was nested
        // in other HTML elements and missing an end tag.
        if (depth <= startNodeDepth) {
          // Check if the endNode is for this one (it might be missing)
          const endNode =
            startNode.parentElement === node.parentElement ? node : null;
          replaceContentWithTemplate('range', template, startNode, endNode);
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

    // If we reach the end of the TreeWalker and still are at a depth > 0 then
    // we're missing the endNode. Process with no endNode so all the startNode
    // siblings are replaced until the end of the element.
    if (depth > 0 && startNode) {
      // Remove everything between startNode and the closing tag of the element
      replaceContentWithTemplate('range', template, startNode);
    }
  };

  // Handle all existing templates in the HTML
  document
    .querySelectorAll('template[for]')
    .forEach((t) => processTemplate(t as HTMLTemplateElement));

  // Watch for, and handle, newly inserted templates or markers in the HTML
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
