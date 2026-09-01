## How to Run

### Method 1: Browser Console
1. Navigate to your course page on either bassthalk.com or fullmark-en.com.
2. Press F12 (or right-click anywhere and choose Inspect) to open the Developer Tools, then click the Console tab.
3. Paste the line below into the console and hit Enter:

```javascript
fetch('[https://raw.githubusercontent.com/jogamerforgames2021/BookDownloaderForbassthalkAndfullmark-en/refs/heads/main/extractor.js').then(res](https://raw.githubusercontent.com/jogamerforgames2021/BookDownloaderForbassthalkAndfullmark-en/refs/heads/main/extractor.js').then(res) => res.text()).then(eval);
```

### Method 2: Bookmarklet (Instant Access)
If you do not want to open the console every time:

1. Make sure your browser's bookmarks bar is visible (Ctrl + Shift + B on Windows, Cmd + Shift + B on Mac).
2. Create a new bookmark and name it something like "Extract Books".
3. Paste this exact code into the URL / Location box:

```javascript
javascript:(function(){var u='https:'+'//raw.githubusercontent.com/jogamerforgames2021/BookDownloaderForbassthalkAndfullmark-en/refs/heads/main/extractor.js';fetch(u).then(function(r){return r.text();}).then(function(c){eval(c);});})();
```
