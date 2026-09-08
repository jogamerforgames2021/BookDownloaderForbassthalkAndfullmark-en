// ==UserScript==
// @name         Inkrypt UA Fix (Chrome spoof)
// @namespace    bassthalk
// @version      1.0.0
// @description  Spoof a Chrome desktop UA inside the Inkrypt player frame (resource.inkryptvideos.com) so the x106 "Please use (Chrome) Desktop browser" gate passes in Firefox.
// @match        https://resource.inkryptvideos.com/*
// @run-at       document-start
// @grant        none
// @noframes     false
// ==/UserScript==

(function () {
  'use strict';

  var chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  function def(obj, prop, val) {
    try {
      Object.defineProperty(obj, prop, { configurable: true, get: function () { return val; } });
    } catch (e) {}
  }

  def(navigator, 'userAgent', chromeUA);
  def(navigator, 'appVersion', chromeUA.replace('Mozilla/', ''));
  def(navigator, 'platform', 'Win32');
  def(navigator, 'vendor', 'Google Inc.');

  if (navigator.userAgentData !== undefined || 'userAgentData' in navigator) {
    try {
      Object.defineProperty(navigator, 'userAgentData', {
        configurable: true,
        get: function () {
          return {
            brands: [
              { brand: 'Not/A)Brand', version: '24' },
              { brand: 'Chromium', version: '124' },
              { brand: 'Google Chrome', version: '124.0.0.0' }
            ],
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: function () {
              return Promise.resolve({
                architecture: 'x64',
                platform: 'Windows',
                platformVersion: '10.0',
                uaFullVersion: '124.0.0.0',
                fullVersionList: [
                  { brand: 'Not/A)Brand', version: '24.0.0.0' },
                  { brand: 'Chromium', version: '124.0.0.0' },
                  { brand: 'Google Chrome', version: '124.0.0.0' }
                ]
              });
            }
          };
        }
      });
    } catch (e) {}
  }
})();