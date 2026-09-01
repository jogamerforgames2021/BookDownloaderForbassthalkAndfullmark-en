(async function scanUniversalCourseBooksFixed() {
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
      // Handle JSON objects saved in storage
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

      // Ensure clean ASCII token and ignore empty objects
      if (isAscii(val) && val.length > 10) {
        if (val.includes('|') || key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
          return val.replace(/^bearer\s+/i, '');
        }
      }
    }
    return '';
  }

  // Extract from storage, fallback to known active token if empty
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

  const existing = document.getElementById('pdf-dynamic-selector');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'pdf-dynamic-selector';
  container.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 999999;
    background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a;
    border-radius: 12px; padding: 16px; width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    font-family: system-ui, sans-serif; direction: rtl;
  `;

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <strong style="font-size:14px; color:#89b4fa;">📚 كاشف الكتب (الكورس #${courseId})</strong>
      <button id="close-pdf-menu" style="background:none; border:none; color:#a6adc8; cursor:pointer; font-size:16px;">✕</button>
    </div>
    
    <div id="pdf-status" style="font-size:12px; color:#a6adc8; margin-bottom:10px;">جاري جلب قائمة المحاضرات...</div>

    <label style="font-size:12px; color:#bac2de; display:block; margin-bottom:4px;">المحاضرة / القسم:</label>
    <select id="section-filter" disabled style="width:100%; padding:8px; border-radius:6px; background:#313244; color:#cdd6f4; border:1px solid #45475a; margin-bottom:10px; outline:none;">
      <option value="all">كل الأقسام</option>
    </select>

    <label style="font-size:12px; color:#bac2de; display:block; margin-bottom:4px;">الكتاب / الملف:</label>
    <select id="pdf-dropdown" disabled style="width:100%; padding:8px; border-radius:6px; background:#313244; color:#cdd6f4; border:1px solid #45475a; margin-bottom:12px; outline:none;">
      <option value="">اختر الكتاب...</option>
    </select>

    <div style="display:flex; gap:8px;">
      <button id="open-pdf-btn" disabled style="flex:1; padding:8px; border-radius:6px; background:#89b4fa; color:#11111b; border:none; font-weight:bold; cursor:pointer; opacity:0.5;">فتح الكتاب المحدد</button>
      <button id="open-all-btn" disabled style="padding:8px; border-radius:6px; background:#a6e3a1; color:#11111b; border:none; font-weight:bold; cursor:pointer; opacity:0.5;">فتح الكل</button>
    </div>
  `;

  document.body.appendChild(container);

  const statusEl = document.getElementById('pdf-status');
  const sectionSelect = document.getElementById('section-filter');
  const bookSelect = document.getElementById('pdf-dropdown');
  const openBtn = document.getElementById('open-pdf-btn');
  const openAllBtn = document.getElementById('open-all-btn');

  document.getElementById('close-pdf-menu').onclick = () => container.remove();

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
    const allBookItems = [];

    sections.forEach(sec => {
      const secOpt = document.createElement('option');
      secOpt.value = sec.id;
      secOpt.textContent = sec.name;
      sectionSelect.appendChild(secOpt);

      const sectionables = sec.sectionables || [];
      sectionables.forEach(item => {
        if (item.sectionable_type === 'book') {
          allBookItems.push({
            sectionId: sec.id,
            itemId: item.id,
            name: item.sectionable?.name || item.title || `كتاب ${item.id}`
          });
        }
      });
    });

    if (allBookItems.length === 0) {
      statusEl.textContent = "لم يتم العثور على أية كتب في هذا الكورس.";
      statusEl.style.color = "#f38ba8";
      return;
    }

    statusEl.textContent = `جاري استخراج روابط ${allBookItems.length} كتاب...`;

    const resolvedBooks = [];
    for (let i = 0; i < allBookItems.length; i++) {
      const item = allBookItems[i];
      statusEl.textContent = `جاري تجهيز الكتب... (${i + 1}/${allBookItems.length})`;

      try {
        const detailRes = await fetch(`${apiBaseUrl}/api/sellables/course/${courseId}/sections/${item.sectionId}/sectionables/${item.itemId}`, {
          headers: { 
            'Authorization': `Bearer ${token}`, 
            'Accept': 'application/json' 
          }
        });
        const detailData = await detailRes.json();
        const source = detailData.sectionable?.source || detailData.source;

        if (source) {
          const pdfUrl = source.startsWith('http') ? source : `${apiBaseUrl}/${source}`;
          resolvedBooks.push({
            sectionId: item.sectionId,
            title: item.name,
            url: pdfUrl
          });
        }
      } catch (err) {
        console.error(`Error resolving item ${item.itemId}`, err);
      }
    }

    function populateBooksDropdown(selectedSectionId) {
      bookSelect.innerHTML = '<option value="">اختر الكتاب...</option>';
      
      const filtered = selectedSectionId === 'all' 
        ? resolvedBooks 
        : resolvedBooks.filter(b => String(b.sectionId) === String(selectedSectionId));

      filtered.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.url;
        opt.textContent = b.title;
        bookSelect.appendChild(opt);
      });

      bookSelect.disabled = filtered.length === 0;
      openBtn.disabled = filtered.length === 0;
      openAllBtn.disabled = filtered.length === 0;
      openBtn.style.opacity = filtered.length ? '1' : '0.5';
      openAllBtn.style.opacity = filtered.length ? '1' : '0.5';
    }

    sectionSelect.disabled = false;
    populateBooksDropdown('all');

    statusEl.textContent = `جاهز! تم تحميل ${resolvedBooks.length} كتاب.`;
    statusEl.style.color = '#a6e3a1';

    sectionSelect.onchange = (e) => {
      populateBooksDropdown(e.target.value);
    };

    openBtn.onclick = () => {
      if (bookSelect.value) window.open(bookSelect.value, '_blank');
      else alert("يرجى اختيار كتاب أولاً!");
    };

    openAllBtn.onclick = () => {
      const currentSelectedSec = sectionSelect.value;
      const targetBooks = currentSelectedSec === 'all'
        ? resolvedBooks
        : resolvedBooks.filter(b => String(b.sectionId) === String(currentSelectedSec));

      targetBooks.forEach(b => window.open(b.url, '_blank'));
    };

  } catch (err) {
    console.error("Fetch error:", err);
    statusEl.textContent = "حدث خطأ أثناء جلب بيانات الكورس.";
    statusEl.style.color = "#f38ba8";
  }
})();
