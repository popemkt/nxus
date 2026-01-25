## 2025-05-22 - Hidden O(N^2) in List Rendering
**Learning:** Using `array.indexOf(item)` inside a `map` loop that iterates over that same array (or a derived view of it) creates a hidden O(N^2) complexity. In `NodeBrowser.tsx`, `flatNodeList.indexOf(node)` was called for every node rendered, causing performance degradation as the list grew (500ms for 50k nodes).
**Action:** When rendering a list where you need the global index, use a running counter or `map` index argument instead of searching for the item again.
