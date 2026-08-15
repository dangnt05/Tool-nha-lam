# Đăng ký học VNU tool

Chrome/Edge extension Manifest V3 for stepping through course registration rows by course code.

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `course-code-navigator` folder.
4. On any normal website, click the extension icon. A compact, vertical control panel opens at the top-right corner of that tab. Paste course codes, choose the applicable separators, then press **START**. Browser-internal pages such as `chrome://` or `edge://` cannot host extensions.

The first found course is highlighted and centred immediately. With auto-select off (the default), manually tick the highlighted yellow/red cell and press the action key to move to the next item. **F8 is Next** and **F6 is Back** by default. **Back** and **Next** are also available on the compact control bar. Next/F8 loops from the final result back to the first result; Back/F6 loops from the first to the last.

Use the **Tách theo** dropdown to choose one separator: new line, comma, semicolon, or space. The input placeholder changes to show the correct paste format for the selected separator. New line is the default. Do not choose **Space** for entries such as `ENG2056 10`, because the space belongs inside that course entry.

## Auto-select safety

Auto-select is optional and disabled by default. It only clicks a cached, explicit checkbox/radio/accessibility control (or a clearly interactive selection cell) from the same `tr` as the exact matching code. It never uses screen coordinates, never loops over courses, confirms immediately from DOM changes (with a 650 ms safety limit), and switches that row to manual fallback if confirmation fails. After manual fallback, manually select the row once and press the Action Key again to continue without another auto-click attempt.

If the website displays a visible registration error (for example, registration has closed) after a selection attempt—or if auto-selection cannot be confirmed—the tool does not advance. It shows an in-tool error popup and plays a short notification tone. Close the popup, resolve or manually acknowledge the issue, then continue when appropriate.

Open **Customize auto-select** to store a per-workflow configuration before the registration page is even open. You can choose safe auto-detection, provide a CSS selector resolved only within the same matched row, or designate the selection-column number. An optional confirmation selector should describe the selected state, for example `input[type=checkbox]:checked` or `[aria-checked='true']`. Press **START** after changing this configuration so the extension can rebuild its cached table index.

Ticking **Auto-select môn hiện tại** opens this configuration automatically. The small gear beside that setting can also show or hide it without changing the Auto-select state.

For a non-standard website, test first with auto-select off. The extension operates on ordinary HTML table rows (`tr` / `td` / `th`) and compares normalized, exact course-code text.
