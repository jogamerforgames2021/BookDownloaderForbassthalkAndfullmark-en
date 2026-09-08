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
      <iframe id="video-player-frame" allow="encrypted-media" allowfullscreen
        style="width:100%; height:360px; border-radius:8px; border:none; background:#000;"
        src="about:blank"></iframe>
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
      statusEl.textContent = `جاري جلب بيانات الفيديو: ${video.name}`;
      statusEl.style.color = '#a6adc8';

      try {
        const detailRes = await fetch(`${apiBaseUrl}/api/sellables/course/${courseId}/sections/${video.sectionId}/sectionables/${video.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

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
        const otp = secObj.otp?.otp;
        const playbackInfo = secObj.otp?.playbackInfo;

        if (!otp || !playbackInfo) {
          statusEl.textContent = "لم يتم العثور على بيانات التشغيل (OTP). الفيديو قد يكون مقفلاً.";
          statusEl.style.color = "#f38ba8";
          return;
        }

        const src = `https://player.vdocipher.com/v2/?otp=${encodeURIComponent(otp)}&playbackInfo=${encodeURIComponent(playbackInfo)}`;
        playerFrame.src = src;
        playerBox.style.display = 'block';

        statusEl.textContent = '✅ يتم الآن تشغيل الفيديو.';
        statusEl.style.color = '#a6e3a1';
      } catch (err) {
        console.error("Error loading video:", err);
        statusEl.textContent = "حدث خطأ أثناء تجهيز الفيديو.";
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