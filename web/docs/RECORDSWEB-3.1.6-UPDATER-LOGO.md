# RecordsWeb 3.1.6 - updater logo fix

The forced-update screen now imports the RecordsWeb logo through Vite's asset pipeline instead of using an absolute `/recordsweb-update-logo.png` URL.

Electron loads packaged renderer content through `file://`. An absolute `/...` image URL can therefore resolve outside the packaged `dist` directory and display as a broken image. Importing the PNG from `src/assets` makes Vite emit a packaged, relative asset reference that works in both development and installed builds.

No visible updater layout changes were made.
