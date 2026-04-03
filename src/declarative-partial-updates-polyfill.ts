/**
 *  @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

(() => {
  // Only process the polyfill if needed
  if (
    document
      .createRange()
      .createContextualFragment('<?marker name=t><template for=t></template>')
      .firstChild === null
  )
    return;

  console.log('Loading declarative partial updates polyfill...');

  // Helper function to actually insert the content and cleanup the
  // processing instructions
  const replaceContentWithTemplate = (
    type: string,
    templateNode: HTMLTemplateElement,
    startNode: Node,
    endNode: Node | null = null,
    target: Document | Element = document
  ): void => {
    // Handle streaming parser.
    //
    // If the document is still loading and either the template or the
    // processing instruction is the last element in the DOM then it may be
    // incomplete. Return and rely on the mutation observer to reprocess later.
    //
    // Prefer readystatechange over DOMContentLoaded so we can start earlier.
    if (
      target instanceof Document &&
      document.readyState == 'loading' &&
      (!templateNode.nextElementSibling ||
        !(startNode as Element).nextElementSibling ||
        (endNode && !(endNode as Element).nextElementSibling))
    ) {
      return;
    }

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

  const findNamedComment = (name: string, target: HTMLElement | null) => {
    if (!target) return false;
    const xpath = `//comment()[contains(., 'name=') and contains(., '${name}')]`;
    const result = document.evaluate(
      xpath,
      target,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    if (result.snapshotLength > 0) {
      return result.snapshotItem(result.snapshotLength - 1) as Element;
    }
    return null;
  };

  const processTemplate = (
    template: HTMLTemplateElement,
    target: Document | Element = document
  ) => {
    if (!template || template.hasAttribute('data-no-patch')) return;

    const name = template.getAttribute('for');

    if (!name) return;

    // Do a basic check to see if the comment likely exists
    const processingInstruction = findNamedComment(
      name,
      template.parentElement
    );
    if (!processingInstruction) return;

    // We use a TreeWalker instead of regular query selectors to
    // handle comments and processing instructions
    const walker = document.createTreeWalker(
      template.parentElement as Node,
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
        processingInstructionText = (node as Comment).data.replace(
          /^\?(start|end|marker)\b/gi,
          (m) => m.toLowerCase()
        );
      } else if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        // If the browser supports processing instructions but not patching
        // (currently no browsers support this, but never say never!)
        // then they are in a slightly different format to comments, so
        // reformat them to be the same to make later processing easier.
        processingInstructionText = `?${(node as ProcessingInstruction).target.toLowerCase()}`;
        if ((node as ProcessingInstruction).data)
          processingInstructionText = `${processingInstructionText} ${(node as ProcessingInstruction).data}`;
      }

      // We should now have a processingInstruction beginning with `?`
      // If not, then ignore and carry on to the next node.
      if (!processingInstructionText || processingInstructionText.length <= 1) {
        continue;
      }

      // CASE 1: We are looking at a simple marker
      if (processingInstructionText.toLowerCase().startsWith('?marker')) {
        // Check if the hash matches (including if there is no hash)
        const regex = new RegExp(`\\bname *= *(["']?)${name}\\1`);
        const isMatch = regex.test(processingInstructionText);

        if (isMatch) {
          // Simple replacement, no range to track
          replaceContentWithTemplate('marker', template, node, target);
          return;
        }
      }
      // CASE 2: We are looking for the start of a range
      else if (processingInstructionText.toLowerCase().startsWith('?start')) {
        depth++;
        // Only match if we haven't already got a startNode
        // to handle duplicate names
        const regex = new RegExp(`\\bname *= *(["']?)${name}\\1`);
        const isMatch = !startNode && regex.test(processingInstructionText);

        if (isMatch) {
          // Start of a range found; track it and keep walking
          startNode = node;
          startNodeDepth = depth;
        }
      }
      // CASE 3: We have found the end tag
      else if (
        processingInstructionText.toLowerCase().startsWith('?end') &&
        startNode
      ) {
        // Only replace content if we're at a depth of less than or equal to
        // this start tag. We'd only be less than if our start tag was nested
        // in other HTML elements and missing an end tag.
        if (depth <= startNodeDepth) {
          // Check if the endNode is for this one (it might be missing)
          const endNode =
            startNode.parentElement === node.parentElement ? node : null;
          replaceContentWithTemplate(
            'range',
            template,
            startNode,
            endNode,
            target
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

    // If we reach the end of the TreeWalker and still are at a depth > 0 then
    // we're missing the endNode. Process with no endNode so all the startNode
    // siblings are replaced until the end of the element.
    if (depth > 0 && startNode) {
      // Remove everything between startNode and the closing tag of the element
      replaceContentWithTemplate('range', template, startNode, null, target);
    }
  };

  // Add a setHTML monkeypatch
  const preprocessHTML = (html: string) => {
    const parser = new DOMParser();
    const parsedHTML = parser.parseFromString(html, 'text/html');
    parsedHTML.querySelectorAll('template[for]').forEach((t) => {
      processTemplate(t as HTMLTemplateElement); //, parsedHTML.body);
    });
    parsedHTML
      .querySelectorAll('template[for]')
      .forEach((t) => t.setAttribute('data-no-patch', ''));
    return parsedHTML.body.innerHTML;
  };
  const originalSetHTML = Element.prototype.setHTML;
  Element.prototype.setHTML = function (html: string) {
    const processedHTML = preprocessHTML(html);
    originalSetHTML.call(this, processedHTML);
  };

  // Handle all existing templates in the HTML
  document.querySelectorAll('template[for]').forEach(
    (t) => processTemplate(t as HTMLTemplateElement) //, t.getRootNode() as HTMLElement)
  );

  // Handle any open shadow roots
  document.querySelectorAll('*').forEach((s) => {
    if (s.shadowRoot)
      s.shadowRoot
        .querySelectorAll('template[for]')
        .forEach((t) =>
          processTemplate(
            t as HTMLTemplateElement,
            t.getRootNode() as HTMLElement
          )
        );
  });

  // Watch for, and handle, newly inserted templates or processing instructions in the HTML
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLTemplateElement && node.hasAttribute('for')) {
          // New template - process that
          processTemplate(node);
        } else if (node instanceof HTMLElement && node.shadowRoot) {
          // New shadow root - process any templates in it
          node.shadowRoot.querySelectorAll('template[for]').forEach((t) => {
            processTemplate(
              t as HTMLTemplateElement,
              t.getRootNode() as HTMLElement
            );
          });
        } else {
          // Process any outstanding templates
          document.querySelectorAll('template[for]').forEach((t) => {
            processTemplate(
              t as HTMLTemplateElement,
              t.getRootNode() as HTMLElement
            );
          });
        }
      }
    }
  });
  observer.observe(document, {childList: true, subtree: true});

  // 1. Capture the original function
  const originalTest = window.test;

  // Check if the original function exists to avoid errors
  if (typeof originalTest !== 'function') {
    console.warn('window.test is not a function; cannot monkey patch.');
    return;
  }
})();
