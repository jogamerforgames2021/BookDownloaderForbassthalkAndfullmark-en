(async function scanCourseVideosAndPlay() {
  const host = window.location.hostname;
  let apiBaseUrl = 'https://api.bassthalk.com';
  if (host.includes('fullmark')) {
    apiBaseUrl = 'https://api.fullmark-en.com';
  }

  const isAscii = (str) => /^[\x00-\x7F]+$/.test(str);

  function extractValidToken(storage) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      let rawVal = storage.getItem(key);
      if (!rawVal) continue;

      let val = rawVal;
      if (rawVal.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(rawVal);
          val = parsed.value || parsed.token || parsed.access_token || parsed.auth || '';
        } catch (e) {
          continue;
        }
      }

      if (typeof val !== 'string' || !val) continue;
      val = val.replace(/^["']|["']$/g, '').trim();

      if (isAscii(val) && val.length > 10) {
        if (val.includes('|') || key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
          return val.replace(/^bearer\s+/i, '');
        }
      }
    }
    return '';
  }

  let token = extractValidToken(localStorage) || extractValidToken(sessionStorage);
  if (!token) {
    token = '162182|7W3b0pLLSRIOkX7jGni9I4CI9VWrjpDCMCP5SnPj75aa09af';
  }

  const match = window.location.href.match(/(?:course|sellables)\/(\d+)/);
  if (!match) {
    alert("تعذر تحديد رقم الكورس من رابط الصفحة الحالية. تأكد من أنك داخل صفحة كورس.");
    return;
  }
  const courseId = match[1];

  // The Inkrypt player SDK refuses non-Chrome browsers (error x106) based on
  // navigator.userAgent. We present a Chrome UA before loading it so the
  // DRM player (already licensed to this session) will play in any browser.
  function spoofChromeUA() {
    try {
      const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      const def = (obj, prop, val) => {
        try {
          Object.defineProperty(obj, prop, { configurable: true, get: () => val });
        } catch (e) {}
      };
      def(window.navigator, 'userAgent', chromeUA);
      def(window.navigator, 'appVersion', chromeUA.replace('Mozilla/', ''));
      def(window.navigator, 'platform', 'Win32');
      def(window.navigator, 'vendor', 'Google Inc.');
      // The Inkrypt gate checks for Chrome via userAgentData in some versions;
      // nulling it out made player construction throw -> black screen. Provide
      // a Chrome-like brands object instead of undefined so those checks pass.
      if (window.navigator.userAgentData !== undefined || 'userAgentData' in window.navigator) {
        def(window.navigator, 'userAgentData', {
          brands: [
            { brand: 'Not/A)Brand', version: '24' },
            { brand: 'Chromium', version: '124' },
            { brand: 'Google Chrome', version: '124.0.0.0' }
          ],
          mobile: false,
          platform: 'Windows',
          getHighEntropyValues: () => Promise.resolve({
            architecture: 'x64', platform: 'Windows', platformVersion: '10.0',
            uaFullVersion: '124.0.0.0', fullVersionList: [
              { brand: 'Not/A)Brand', version: '24.0.0.0' },
              { brand: 'Chromium', version: '124.0.0.0' },
              { brand: 'Google Chrome', version: '124.0.0.0' }
            ]
          })
        });
      }
    } catch (e) {}
  }

  let inkSdkLoading = false;
  function waitForInkSdk(cb) {
    let tries = 0;
    const t = setInterval(() => {
      // An initialized SDK exposes getObjects(). The loader stub we install
      // while ink.js is still fetching does not have it yet.
      if (window.inkrypt && typeof window.inkrypt.getObjects === 'function') {
        clearInterval(t);
        inkSdkLoading = false;
        cb(null);
      } else if (++tries > 120) {
        clearInterval(t);
        inkSdkLoading = false;
        cb(new Error("لم يتم تحميل مشغل Inkrypt في الوقت المناسب."));
      }
    }, 250);
  }

  function loadInkSdk(cb) {
    if (window.inkrypt && typeof window.inkrypt.getObjects === 'function') {
      // Already initialized (either the site's own instance on a video page,
      // or a previous run). Reuse it: ink.js keeps the loader object and only
      // fills it out, so re-injecting a second copy clashes (redeclaration
      // errors) and never re-processes our queued job.
      return cb(null);
    }
    if (inkSdkLoading) return waitForInkSdk(cb);

    inkSdkLoading = true;
    // No initialized SDK yet (we're on a course page the site hasn't touched).
    // Install inkrypt's loader stub contract, then inject ink.js the same way
    // the SDK's own embed page does.
    try {
      window.inkrypt = {};
      window.inkrypt.add = function (job) {
        (window.inkrypt.a = window.inkrypt.a || []).push(job);
      };
    } catch (e) {}

    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://resource.inkryptvideos.com/v2-a83ns52/ink.js';
    s.onerror = () => {
      inkSdkLoading = false;
      cb(new Error("تعذر تحميل مشغل Inkrypt."));
    };
    document.head.appendChild(s);
    waitForInkSdk(cb);
  }

  function playInkrypt(video, otp) {
    const inkBox = document.getElementById('video-ink-box');
    const inkContainer = document.getElementById('video-ink-container');
    inkBox.style.display = 'block';
    inkContainer.innerHTML = '';

    spoofChromeUA();
    loadInkSdk((err) => {
      if (err) {
        statusEl.textContent = err.message;
        statusEl.style.color = '#f38ba8';
        return;
      }
      statusEl.textContent = '✅ يتم الآن تشغيل الفيديو (Inkrypt).';
      statusEl.style.color = '#a6e3a1';
      window.inkrypt.add({
        video_id: video.source,
        otp: otp.otp,
        api: 'api',
        license: 'license',
        config: JSON.stringify(otp.configuration || {}),
        container: inkContainer
      });
    });
  }

  const existing = document.getElementById('video-dynamic-player');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'video-dynamic-player';
  container.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 999999;
    background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a;
    border-radius: 12px; padding: 16px; width: 680px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    font-family: system-ui, sans-serif; direction: rtl;
  `;

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <strong style="font-size:14px; color:#74c7ec;">🎬 مشغل الفيديوهات (الكورس #${courseId})</strong>
      <button id="video-close-btn" style="background:none; border:none; color:#a6adc8; cursor:pointer; font-size:16px;">✕</button>
    </div>

    <div id="video-status" style="font-size:12px; color:#a6adc8; margin-bottom:10px;">جاري جلب قائمة الفيديوهات...</div>

    <label style="font-size:12px; color:#bac2de; display:block; margin-bottom:4px;">القسم:</label>
    <select id="video-section-filter" disabled style="width:100%; padding:8px; border-radius:6px; background:#313244; color:#cdd6f4; border:1px solid #45475a; margin-bottom:10px; outline:none;">
      <option value="all">كل الأقسام</option>
    </select>

    <label style="font-size:12px; color:#bac2de; display:block; margin-bottom:4px;">الفيديو:</label>
    <select id="video-dropdown" disabled style="width:100%; padding:8px; border-radius:6px; background:#313244; color:#cdd6f4; border:1px solid #45475a; margin-bottom:12px; outline:none;">
      <option value="">اختر الفيديو...</option>
    </select>

    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <button id="video-play-btn" disabled style="flex:1; padding:8px; border-radius:6px; background:#74c7ec; color:#11111b; border:none; font-weight:bold; cursor:pointer; opacity:0.5;">تشغيل الفيديو</button>
    </div>

    <div id="video-player-box" style="display:none;">
      <iframe id="video-player-frame" allow="encrypted-media; autoplay; picture-in-picture" allowfullscreen
        style="width:100%; height:360px; border-radius:8px; border:none; background:#000;"
        src="about:blank"></iframe>
    </div>

    <div id="video-ink-box" style="display:none;">
      <div id="video-ink-container" style="width:100%; height:360px; border-radius:8px; background:#000; overflow:hidden;"></div>
    </div>
  `;

  document.body.appendChild(container);

  const statusEl = document.getElementById('video-status');
  const sectionSelect = document.getElementById('video-section-filter');
  const videoSelect = document.getElementById('video-dropdown');
  const playBtn = document.getElementById('video-play-btn');
  const playerBox = document.getElementById('video-player-box');
  const playerFrame = document.getElementById('video-player-frame');

  document.getElementById('video-close-btn').onclick = () => container.remove();

  const videos = [];

  try {
    const res = await fetch(`${apiBaseUrl}/api/sellables/${courseId}?with_content=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (res.status === 401) {
      statusEl.textContent = "خطأ 401: التوكين غير صالح أو منتهي الصلاحية.";
      statusEl.style.color = "#f38ba8";
      return;
    }

    const data = await res.json();
    const sections = data.sections || [];

    sections.forEach(sec => {
      const secOpt = document.createElement('option');
      secOpt.value = sec.id;
      secOpt.textContent = sec.name;
      sectionSelect.appendChild(secOpt);

      const sectionables = sec.sectionables || [];
      sectionables.forEach(item => {
        if (item.sectionable_type === 'video') {
          videos.push({
            id: item.id,
            sectionId: sec.id,
            sectionName: sec.name,
            name: item.sectionable?.name || item.title || `فيديو ${item.id}`
          });
        }
      });
    });

    if (videos.length === 0) {
      statusEl.textContent = "لم يتم العثور على أية فيديوهات في هذا الكورس.";
      statusEl.style.color = "#f38ba8";
      return;
    }

    function populateVideosDropdown(selectedSectionId) {
      videoSelect.innerHTML = '<option value="">اختر الفيديو...</option>';

      const filtered = selectedSectionId === 'all'
        ? videos
        : videos.filter(v => String(v.sectionId) === String(selectedSectionId));

      filtered.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        videoSelect.appendChild(opt);
      });

      videoSelect.disabled = filtered.length === 0;
      playBtn.disabled = filtered.length === 0;
      playBtn.style.opacity = filtered.length ? '1' : '0.5';
    }

    sectionSelect.disabled = false;
    populateVideosDropdown('all');

    statusEl.textContent = `جاهز! تم العثور على ${videos.length} فيديو في ${sections.length} قسم.`;
    statusEl.style.color = '#a6e3a1';

    sectionSelect.onchange = (e) => populateVideosDropdown(e.target.value);

    playBtn.onclick = async () => {
      if (!videoSelect.value) {
        alert("يرجى اختيار فيديو أولاً!");
        return;
      }
      const video = videos.find(v => String(v.id) === String(videoSelect.value));
      if (!video) return;

      playBtn.disabled = true;
      playBtn.style.opacity = 0.7;
      playBtn.textContent = "جاري تجهيز المشغل...";
      playerBox.style.display = 'none';
      playerFrame.src = 'about:blank';
      document.getElementById('video-ink-box').style.display = 'none';
      document.getElementById('video-ink-container').innerHTML = '';
      statusEl.textContent = `جاري جلب بيانات الفيديو: ${video.name}`;
      statusEl.style.color = '#a6adc8';

      try {
        const ac = new AbortController();
        const timeoutId = setTimeout(() => ac.abort(), 20000);
        let detailRes;
        try {
          detailRes = await fetch(`${apiBaseUrl}/api/sellables/course/${courseId}/sections/${video.sectionId}/sectionables/${video.id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
            signal: ac.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (detailRes.status === 401) {
          statusEl.textContent = "خطأ 401: التوكين غير صالح أو منتهي الصلاحية.";
          statusEl.style.color = "#f38ba8";
          return;
        }
        if (!detailRes.ok) {
          statusEl.textContent = `خطأ ${detailRes.status}: تعذر فتح هذا الفيديو (ربما غير متاح بعد).`;
          statusEl.style.color = "#f38ba8";
          return;
        }

        const detailData = await detailRes.json();
        const secObj = detailData.sectionable || detailData;
        const platform = (secObj.platform || '').toLowerCase();
        const source = secObj.source;
        const otp = secObj.otp;

        if (platform === 'youtube') {
          if (!source) throw new Error("لا يوجد مصدر فيديو YouTube.");
          playerFrame.src = `https://www.youtube.com/embed/${encodeURIComponent(source)}?autoplay=1&rel=0`;
          playerFrame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
          playerBox.style.display = 'block';
          statusEl.textContent = '✅ يتم الآن تشغيل الفيديو (YouTube).';
          statusEl.style.color = '#a6e3a1';
        } else if (platform === 'ink') {
          const otpVal = otp && otp.otp;
          if (!otpVal || !source) {
            statusEl.textContent = "لم يتم العثور على بيانات التشغيل (OTP). الفيديو قد يكون مقفلاً.";
            statusEl.style.color = "#f38ba8";
            return;
          }
          playInkrypt({ source }, otp);
        } else {
          // Default: VdoCipher (vdocipher platform)
          const otpVal = otp && otp.otp;
          const playbackInfo = otp && (otp.playbackInfo || otp.overrideInfo || '');
          if (!otpVal || !playbackInfo) {
            statusEl.textContent = "لم يتم العثور على بيانات التشغيل (OTP). الفيديو قد يكون مقفلاً.";
            statusEl.style.color = "#f38ba8";
            return;
          }
          const src = `https://player.vdocipher.com/v2/?otp=${encodeURIComponent(otpVal)}&playbackInfo=${encodeURIComponent(playbackInfo)}`;
          playerFrame.allow = 'encrypted-media; autoplay; picture-in-picture';
          playerFrame.src = src;
          playerBox.style.display = 'block';
          statusEl.textContent = '✅ يتم الآن تشغيل الفيديو.';
          statusEl.style.color = '#a6e3a1';
        }
      } catch (err) {
        console.error("Error loading video:", err);
        statusEl.textContent = err.message || "حدث خطأ أثناء تجهيز الفيديو.";
        statusEl.style.color = "#f38ba8";
      } finally {
        playBtn.disabled = false;
        playBtn.style.opacity = '1';
        playBtn.textContent = "تشغيل الفيديو";
      }
    };

  } catch (err) {
    console.error("Fetch error:", err);
    statusEl.textContent = "حدث خطأ أثناء جلب بيانات الكورس.";
    statusEl.style.color = "#f38ba8";
  }
})();