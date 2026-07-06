# Editor UX Rules (session cache — canonical spec: spec/product/editor.md)

**The Unified Plane**: everything in the outline — nodes, fields, field values — lives on the same visual plane. There is no distinction between "a node's content area" and "a field's content area"; all of it is text on the same slate. Field values are not form inputs: no hover effects, no visual input boxes, same text styles as node content (`cursor-text` is the only editability signal). If you can click and edit a node's content, you can click and edit a field's value the same way.

All layout metrics, field-row rules, zoomed-in view, navigation, field-type icons, and node-reference rendering: `spec/product/editor.md`.
