/*************************
 * グローバル状態 (State)
 *************************/
const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth() + 1;

// 基本必要スタッフ数 (既定)
let requiredStaff = 3;

// 日別必要スタッフ数
// 例: { 1: 2, 2: 3, ... }
let dailyRequiredStaff = {};

// スタッフ配列
let staffList = [
  {
    id: 1,
    name: "佐藤",
    requiredDaysOff: 8,
    absoluteDaysOff: [],
    requestedDaysOff: [],
    mandatoryWorkDays: [],
  },
  {
    id: 2,
    name: "田中",
    requiredDaysOff: 10,
    absoluteDaysOff: [],
    requestedDaysOff: [],
    mandatoryWorkDays: [],
  },
];

// 生成されたシフト結果 { dayNumber: [staffId, ...], ... }
let generatedShift = null;

/** 
 * 4連勤が2回以上発生したスタッフの
 * 「4連勤ブロック日」を記録するためのマップ
 * 例: { staffId: Set([2,3,4,5, 10,11,12,13]), ... }
 * => この日は紫ハイライトする
 */
let fourConsecutiveHighlightMap = {};

/*******************************************
 * localStorage読み書き
 *******************************************/
function loadStateFromLocalStorage() {
  const saved = localStorage.getItem("myShiftSchedulerData");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.currentYear) currentYear = parsed.currentYear;
      if (parsed.currentMonth) currentMonth = parsed.currentMonth;
      if (typeof parsed.requiredStaff === "number") requiredStaff = parsed.requiredStaff;
      if (parsed.dailyRequiredStaff) dailyRequiredStaff = parsed.dailyRequiredStaff;
      if (parsed.staffList) staffList = parsed.staffList;
      if (parsed.generatedShift) generatedShift = parsed.generatedShift;
    } catch (e) {
      console.error("Failed to parse localStorage data:", e);
    }
  }
}

function saveStateToLocalStorage() {
  const data = {
    currentYear,
    currentMonth,
    requiredStaff,
    dailyRequiredStaff,
    staffList,
    generatedShift,
  };
  localStorage.setItem("myShiftSchedulerData", JSON.stringify(data));
}

/*******************************************
 * リセット用
 *******************************************/
function resetAllData() {
  const ok = confirm("本当にリセットしますか？");
  if (!ok) return;

  localStorage.removeItem("myShiftSchedulerData");
  
  currentYear = today.getFullYear();
  currentMonth = today.getMonth() + 1;
  requiredStaff = 3;
  dailyRequiredStaff = {};
  staffList = [
    {
      id: 1,
      name: "佐藤",
      requiredDaysOff: 8,
      absoluteDaysOff: [],
      requestedDaysOff: [],
      mandatoryWorkDays: [],
    },
    {
      id: 2,
      name: "田中",
      requiredDaysOff: 10,
      absoluteDaysOff: [],
      requestedDaysOff: [],
      mandatoryWorkDays: [],
    },
  ];
  generatedShift = null;
  fourConsecutiveHighlightMap = {};

  render();
}

/*******************************************
 * 日付関連
 *******************************************/
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
function getDayOfWeek(year, month, day) {
  const date = new Date(year, month - 1, day);
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return days[date.getDay()];
}

/*******************************************
 * シフト生成ロジック
 *******************************************/
function generateShift() {
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const shiftTable = {};
  dates.forEach((d) => {
    shiftTable[d] = [];
  });

  // スタッフごとに出勤可能日を把握
  const staffAvailability = staffList.map((s) => {
    const availableDays = dates.filter((day) => {
      const dateStr = `${currentYear}-${currentMonth}-${day}`;
      return !s.absoluteDaysOff.includes(dateStr);
    });
    return { ...s, availableDays };
  });

  // 1) mandatory 割り当て
  dates.forEach((day) => {
    const dateStr = `${currentYear}-${currentMonth}-${day}`;
    const needed = dailyRequiredStaff[day] ?? requiredStaff;

    // 必須出勤スタッフ
    const mandatoryIds = staffAvailability
      .filter((s) => s.mandatoryWorkDays.includes(dateStr))
      .map((s) => s.id);

    shiftTable[day] = [...mandatoryIds];

    let remain = needed - mandatoryIds.length;
    if (remain > 0) {
      // 希望休を持たない人を優先
      const sorted = staffAvailability
        .filter((s) => 
          !shiftTable[day].includes(s.id) &&
          !s.absoluteDaysOff.includes(dateStr)
        )
        .sort((a, b) => {
          // 希望休を後ろに
          const aReq = a.requestedDaysOff.includes(dateStr) ? 1 : 0;
          const bReq = b.requestedDaysOff.includes(dateStr) ? 1 : 0;
          if (aReq !== bReq) return aReq - bReq;
          // 必要休日数が多い人は後ろ
          return a.requiredDaysOff - b.requiredDaysOff;
        });

      const add = sorted.slice(0, remain).map((s) => s.id);
      shiftTable[day].push(...add);
    }
  });

  // 2) 必要休日数に満たないスタッフを調整
  staffList.forEach((s) => {
    const workingDays = Object.keys(shiftTable)
      .map((k) => parseInt(k))
      .filter((k) => shiftTable[k].includes(s.id));
    const totalDays = getDaysInMonth(currentYear, currentMonth);
    const actualOff = totalDays - workingDays.length;

    if (actualOff < s.requiredDaysOff) {
      const needMoreOff = s.requiredDaysOff - actualOff;

      // 休みに振り替え可能な日
      const adjustableDays = workingDays
        .filter((day) => {
          const dateStr = `${currentYear}-${currentMonth}-${day}`;
          // mandatoryな日は外せない
          return !s.mandatoryWorkDays.includes(dateStr);
        })
        .sort((a, b) => {
          // 希望休の日を優先的に休みに
          const aReq = s.requestedDaysOff.includes(`${currentYear}-${currentMonth}-${a}`) ? -1 : 0;
          const bReq = s.requestedDaysOff.includes(`${currentYear}-${currentMonth}-${b}`) ? -1 : 0;
          if (aReq !== bReq) return aReq - bReq;
          // 出勤人数が多い日を先に休みに
          return shiftTable[b].length - shiftTable[a].length;
        });

      for (let i = 0; i < Math.min(needMoreOff, adjustableDays.length); i++) {
        const d = adjustableDays[i];
        shiftTable[d] = shiftTable[d].filter((id) => id !== s.id);
      }
    }
  });

  // 完了
  generatedShift = shiftTable;

  // 4連勤ハイライト判定
  updateFourConsecutiveHighlight();

  render();
}

/*******************************************
 * 「シフト表セルをクリックで出勤⇔休みをトグル」
 *******************************************/
function toggleShiftCell(staffId, day) {
  if (!generatedShift) return;

  const assigned = generatedShift[day] || [];
  if (assigned.includes(staffId)) {
    // 出勤中なら「休み」に
    generatedShift[day] = assigned.filter((id) => id !== staffId);
  } else {
    // 休みなら「出勤」に
    generatedShift[day] = [...assigned, staffId];
  }

  // 4連勤ハイライト判定
  updateFourConsecutiveHighlight();

  render();
}

/*******************************************
 * 4連勤が2回以上 → ハイライト
 * 1回以下 → ハイライト解除
 *******************************************/
function updateFourConsecutiveHighlight() {
  fourConsecutiveHighlightMap = {}; // リセット

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  // スタッフごとに「4連勤ブロック」を抽出
  staffList.forEach((s) => {
    let consecutive = 0;
    let blocks = []; // 4連勤ブロックを配列で保持 (例: [[startDay, endDay], ...])
    
    // 1日～月末を走査
    for (let d = 1; d <= daysInMonth; d++) {
      const isWorking = generatedShift && generatedShift[d]?.includes(s.id);
      if (isWorking) {
        consecutive++;
      } else {
        // 休みになったら連勤終了
        if (consecutive >= 4) {
          // 直前の4日ブロック = [d - consecutive, d - 1] のうち「最後の4日単位」
          // 例えば consecutive=4 なら [d-3, d-1]
          // もし 6連勤なら、その中には 3つの「4連勤ブロック」がある:
          //    (d-5 ~ d-2), (d-4 ~ d-1), ...
          // 今回は「連勤のたびに可能な限り全部4日ブロックと数える」ことで
          // オーバーラップも全部カウントする
          for (let offset = 0; offset <= consecutive - 4; offset++) {
            let startDay = d - 4 - offset;
            let endDay = d - 1 - offset;
            blocks.push([startDay, endDay]);
          }
        }
        consecutive = 0;
      }
    }
    // 月末まで連勤が続くケースにも対応
    if (consecutive >= 4) {
      for (let offset = 0; offset <= consecutive - 4; offset++) {
        let startDay = daysInMonth - 4 - offset + 1; // +1はindex調整
        let endDay = daysInMonth - offset;
        blocks.push([startDay, endDay]);
      }
    }

    // blocks の数(ブロック総数)が 2個以上 → それらの日をハイライト
    if (blocks.length >= 2) {
      // このスタッフの該当日をまとめる
      const highlightSet = new Set();
      blocks.forEach(([start, end]) => {
        for (let dd = start; dd <= end; dd++) {
          highlightSet.add(dd);
        }
      });
      fourConsecutiveHighlightMap[s.id] = highlightSet;
    }
  });
}

/*******************************************
 * イベントハンドラ
 *******************************************/
function goToPreviousMonth() {
  if (currentMonth === 1) {
    currentMonth = 12;
    currentYear--;
  } else {
    currentMonth--;
  }
  generatedShift = null;
  fourConsecutiveHighlightMap = {};
  render();
}

function goToNextMonth() {
  if (currentMonth === 12) {
    currentMonth = 1;
    currentYear++;
  } else {
    currentMonth++;
  }
  generatedShift = null;
  fourConsecutiveHighlightMap = {};
  render();
}

function onChangeRequiredStaff(e) {
  const val = parseInt(e.target.value, 10);
  requiredStaff = isNaN(val) ? 1 : val;
  render();
}

function onChangeDailyStaffRequirement(day, e) {
  const val = parseInt(e.target.value, 10);
  dailyRequiredStaff[day] = isNaN(val) ? requiredStaff : val;
  render();
}

function addStaff() {
  const newId = staffList.length > 0
    ? Math.max(...staffList.map((s) => s.id)) + 1
    : 1;
  staffList.push({
    id: newId,
    name: `新しいスタッフ ${newId}`,
    requiredDaysOff: 8,
    absoluteDaysOff: [],
    requestedDaysOff: [],
    mandatoryWorkDays: [],
  });
  render();
}

function removeStaff(staffId) {
  staffList = staffList.filter((s) => s.id !== staffId);
  render();
}

function updateStaffInfo(staffId, field, value) {
  staffList = staffList.map((s) => {
    if (s.id === staffId) {
      return { ...s, [field]: value };
    }
    return s;
  });
  render();
}

function toggleDate(staffId, day, type) {
  const dateStr = `${currentYear}-${currentMonth}-${day}`;
  staffList = staffList.map((s) => {
    if (s.id !== staffId) return s;

    let updated = { ...s };

    const hasAbs = s.absoluteDaysOff.includes(dateStr);
    const hasReq = s.requestedDaysOff.includes(dateStr);
    const hasMan = s.mandatoryWorkDays.includes(dateStr);

    switch (type) {
      case "absolute":
        if (hasAbs) {
          updated.absoluteDaysOff = updated.absoluteDaysOff.filter((d) => d !== dateStr);
        } else {
          updated.absoluteDaysOff = [...updated.absoluteDaysOff.filter((d) => d !== dateStr), dateStr];
          updated.requestedDaysOff = updated.requestedDaysOff.filter((d) => d !== dateStr);
          updated.mandatoryWorkDays = updated.mandatoryWorkDays.filter((d) => d !== dateStr);
        }
        break;
      case "requested":
        if (hasReq) {
          updated.requestedDaysOff = updated.requestedDaysOff.filter((d) => d !== dateStr);
        } else {
          updated.requestedDaysOff = [...updated.requestedDaysOff.filter((d) => d !== dateStr), dateStr];
          updated.absoluteDaysOff = updated.absoluteDaysOff.filter((d) => d !== dateStr);
          updated.mandatoryWorkDays = updated.mandatoryWorkDays.filter((d) => d !== dateStr);
        }
        break;
      case "mandatory":
        if (hasMan) {
          updated.mandatoryWorkDays = updated.mandatoryWorkDays.filter((d) => d !== dateStr);
        } else {
          updated.mandatoryWorkDays = [...updated.mandatoryWorkDays.filter((d) => d !== dateStr), dateStr];
          updated.absoluteDaysOff = updated.absoluteDaysOff.filter((d) => d !== dateStr);
          updated.requestedDaysOff = updated.requestedDaysOff.filter((d) => d !== dateStr);
        }
        break;
      default:
        break;
    }
    return updated;
  });
  render();
}

/*******************************************
 * メイン描画
 *******************************************/
function render() {
  const container = document.getElementById("shift-scheduler");
  if (!container) return;
  container.innerHTML = "";

  // ラッパ
  const mainWrapper = document.createElement("div");
  mainWrapper.className = "scheduler-container";

  // タイトル
  const titleEl = document.createElement("h1");
  titleEl.className = "scheduler-title";
  titleEl.textContent = "シフトスケジューラー (4連勤2回以上で紫ハイライト/トグル可)";
  mainWrapper.appendChild(titleEl);

  /********************************
   * 基本設定 + リセットボタン
   ********************************/
  const basicSection = document.createElement("div");
  basicSection.className = "section mb-8";

  const basicTitle = document.createElement("h2");
  basicTitle.className = "section-title";
  basicTitle.textContent = "基本設定";
  basicSection.appendChild(basicTitle);

  // ナビ
  const navRow = document.createElement("div");
  navRow.className = "flex mb-4";

  const leftDiv = document.createElement("div");
  leftDiv.className = "flex mr-4";

  const prevBtn = document.createElement("button");
  prevBtn.className = "icon-button mr-2";
  prevBtn.innerHTML = chevronLeftIconSVG(20);
  prevBtn.addEventListener("click", goToPreviousMonth);
  leftDiv.appendChild(prevBtn);

  const ymSpan = document.createElement("span");
  ymSpan.className = "text-lg font-medium";
  ymSpan.textContent = `${currentYear}年 ${currentMonth}月`;
  leftDiv.appendChild(ymSpan);

  const nextBtn = document.createElement("button");
  nextBtn.className = "icon-button ml-2";
  nextBtn.innerHTML = chevronRightIconSVG(20);
  nextBtn.addEventListener("click", goToNextMonth);
  leftDiv.appendChild(nextBtn);

  navRow.appendChild(leftDiv);

  // 右ブロック(基本必要スタッフ数 + リセットボタン)
  const rightDiv = document.createElement("div");
  rightDiv.className = "flex";

  const labelStaff = document.createElement("label");
  labelStaff.className = "mr-2 font-medium";
  labelStaff.textContent = "基本必要スタッフ数:";
  rightDiv.appendChild(labelStaff);

  const staffInput = document.createElement("input");
  staffInput.type = "number";
  staffInput.min = "1";
  staffInput.value = requiredStaff;
  staffInput.className = "input-text mr-4";
  staffInput.addEventListener("change", onChangeRequiredStaff);
  rightDiv.appendChild(staffInput);

  // リセットボタン
  const resetBtn = document.createElement("button");
  resetBtn.className = "button";
  resetBtn.textContent = "リセット";
  resetBtn.addEventListener("click", resetAllData);
  rightDiv.appendChild(resetBtn);

  navRow.appendChild(rightDiv);
  basicSection.appendChild(navRow);

  // 日別必要スタッフ数
  const dayReqTitle = document.createElement("h3");
  dayReqTitle.className = "font-medium mb-2";
  dayReqTitle.textContent = "日別必要スタッフ数の設定";
  basicSection.appendChild(dayReqTitle);

  const daysGrid = document.createElement("div");
  daysGrid.className = "grid-7";

  const daysInMonthCount = getDaysInMonth(currentYear, currentMonth);
  for (let d = 1; d <= daysInMonthCount; d++) {
    const dayDiv = document.createElement("div");
    dayDiv.className = "text-center mb-2";

    const dw = getDayOfWeek(currentYear, currentMonth, d);
    const label = document.createElement("div");
    label.className = 
      "mb-1 font-medium " + 
      (dw === "土" ? "text-saturday" : dw === "日" ? "text-sunday" : "");
    label.textContent = `${d}(${dw})`;
    dayDiv.appendChild(label);

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = dailyRequiredStaff[d] ?? requiredStaff;
    input.className = "input-text";
    input.addEventListener("change", (e) => onChangeDailyStaffRequirement(d, e));
    dayDiv.appendChild(input);

    daysGrid.appendChild(dayDiv);
  }

  basicSection.appendChild(daysGrid);
  mainWrapper.appendChild(basicSection);

  /********************************
   * スタッフ設定
   ********************************/
  const staffSection = document.createElement("div");
  staffSection.className = "mb-8";

  const staffHeader = document.createElement("div");
  staffHeader.className = "flex-between mb-4";

  const staffTitle = document.createElement("h2");
  staffTitle.className = "section-title mb-0";
  staffTitle.textContent = "スタッフ設定";
  staffHeader.appendChild(staffTitle);

  const addButton = document.createElement("button");
  addButton.className = "button";
  addButton.innerHTML = plusIconSVG(16) + "スタッフ追加";
  addButton.addEventListener("click", addStaff);
  staffHeader.appendChild(addButton);

  staffSection.appendChild(staffHeader);

  staffList.forEach((s) => {
    const card = document.createElement("div");
    card.className = "section mb-4";

    const cardTop = document.createElement("div");
    cardTop.className = "flex-between mb-2";

    const leftBox = document.createElement("div");
    leftBox.className = "flex";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = s.name;
    nameInput.className = "input-text mr-4";
    nameInput.style.width = "auto";
    nameInput.addEventListener("change", (e) => {
      updateStaffInfo(s.id, "name", e.target.value);
    });
    leftBox.appendChild(nameInput);

    const reqOffLabel = document.createElement("label");
    reqOffLabel.className = "mr-2 font-medium";
    reqOffLabel.textContent = "必要休日数:";
    leftBox.appendChild(reqOffLabel);

    const reqOffInput = document.createElement("input");
    reqOffInput.type = "number";
    reqOffInput.min = "0";
    reqOffInput.max = daysInMonthCount;
    reqOffInput.value = s.requiredDaysOff;
    reqOffInput.className = "input-text";
    reqOffInput.addEventListener("change", (e) => {
      updateStaffInfo(s.id, "requiredDaysOff", parseInt(e.target.value) || 0);
    });
    leftBox.appendChild(reqOffInput);

    cardTop.appendChild(leftBox);

    const delBtn = document.createElement("button");
    delBtn.className = "icon-button";
    delBtn.innerHTML = trashIconSVG(18);
    delBtn.addEventListener("click", () => removeStaff(s.id));
    cardTop.appendChild(delBtn);

    card.appendChild(cardTop);

    // 絶対休・希望休・必須出勤 のラベル
    const labelRow = document.createElement("div");
    labelRow.className = "flex mb-2 text-sm";
    labelRow.innerHTML = `
      <div class="flex mr-4">
        <span class="inline-block w-3 h-3 bg-absolute-off mr-1" style="border-radius:50%;"></span> 絶対休み
      </div>
      <div class="flex mr-4">
        <span class="inline-block w-3 h-3 bg-requested-off mr-1" style="border-radius:50%;"></span> 希望休
      </div>
      <div class="flex">
        <span class="inline-block w-3 h-3 bg-mandatory mr-1" style="border-radius:50%;"></span> 必ず出勤
      </div>
    `;
    card.appendChild(labelRow);

    // 日付グリッド
    const dateGrid = document.createElement("div");
    dateGrid.className = "grid-7";

    for (let d = 1; d <= daysInMonthCount; d++) {
      const cell = document.createElement("div");
      cell.className = "text-center";

      const dw = getDayOfWeek(currentYear, currentMonth, d);
      const dayLabel = document.createElement("div");
      dayLabel.className = 
        "mb-1 text-sm " +
        (dw === "土" ? "text-saturday" : dw === "日" ? "text-sunday" : "");
      dayLabel.textContent = d;
      cell.appendChild(dayLabel);

      const btnBox = document.createElement("div");
      btnBox.style.display = "flex";
      btnBox.style.flexDirection = "column";
      btnBox.style.gap = "4px";

      // 絶対休
      const absBtn = document.createElement("button");
      absBtn.className =
        "circle-button " +
        (s.absoluteDaysOff.includes(`${currentYear}-${currentMonth}-${d}`)
          ? "bg-absolute-off"
          : "");
      absBtn.title = "絶対休み";
      absBtn.addEventListener("click", () => toggleDate(s.id, d, "absolute"));
      btnBox.appendChild(absBtn);

      // 希望休
      const reqBtn = document.createElement("button");
      reqBtn.className =
        "circle-button " +
        (s.requestedDaysOff.includes(`${currentYear}-${currentMonth}-${d}`)
          ? "bg-requested-off"
          : "");
      reqBtn.title = "希望休";
      reqBtn.addEventListener("click", () => toggleDate(s.id, d, "requested"));
      btnBox.appendChild(reqBtn);

      // 必ず出勤
      const manBtn = document.createElement("button");
      manBtn.className =
        "circle-button " +
        (s.mandatoryWorkDays.includes(`${currentYear}-${currentMonth}-${d}`)
          ? "bg-mandatory"
          : "");
      manBtn.title = "必ず出勤";
      manBtn.addEventListener("click", () => toggleDate(s.id, d, "mandatory"));
      btnBox.appendChild(manBtn);

      cell.appendChild(btnBox);
      dateGrid.appendChild(cell);
    }

    card.appendChild(dateGrid);
    staffSection.appendChild(card);
  });

  mainWrapper.appendChild(staffSection);

  /********************************
   * シフト生成ボタン
   ********************************/
  const genBtnWrapper = document.createElement("div");
  genBtnWrapper.className = "text-center mb-8";

  const genBtn = document.createElement("button");
  genBtn.className = "button button-icon";
  genBtn.innerHTML = calendarIconSVG(20) + "シフト表を生成";
  genBtn.addEventListener("click", generateShift);
  genBtnWrapper.appendChild(genBtn);

  mainWrapper.appendChild(genBtnWrapper);

  /********************************
   * 生成されたシフト表 (クリックトグル)
   ********************************/
  if (generatedShift) {
    const resultDiv = document.createElement("div");
    resultDiv.className = "mb-8";

    const resultTitle = document.createElement("h2");
    resultTitle.className = "section-title mb-4";
    resultTitle.textContent = "生成されたシフト表 (セルをクリックで出勤⇔休みトグル)";
    resultDiv.appendChild(resultTitle);

    const tableContainer = document.createElement("div");
    tableContainer.className = "table-container";

    const table = document.createElement("table");
    table.className = "table";

    // thead
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const thDate = document.createElement("th");
    thDate.textContent = "日付";
    headerRow.appendChild(thDate);

    staffList.forEach((s) => {
      const th = document.createElement("th");
      th.textContent = s.name;
      headerRow.appendChild(th);
    });

    const thCount = document.createElement("th");
    thCount.textContent = "出勤人数";
    headerRow.appendChild(thCount);

    const thNeeded = document.createElement("th");
    thNeeded.textContent = "必要人数";
    headerRow.appendChild(thNeeded);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // tbody
    const tbody = document.createElement("tbody");
    for (let d = 1; d <= daysInMonthCount; d++) {
      const row = document.createElement("tr");
      const dw = getDayOfWeek(currentYear, currentMonth, d);
      if (dw === "土") {
        row.style.backgroundColor = "var(--color-saturday-bg)";
      } else if (dw === "日") {
        row.style.backgroundColor = "var(--color-sunday-bg)";
      }

      // 日付セル
      const dateCell = document.createElement("td");
      dateCell.className = "font-medium";
      dateCell.textContent = `${d}日(${dw})`;
      row.appendChild(dateCell);

      // 出勤/休みセル
      const assigned = generatedShift[d] || [];
      const needed = dailyRequiredStaff[d] ?? requiredStaff;

      staffList.forEach((s) => {
        const cell = document.createElement("td");
        cell.style.cursor = "pointer"; // トグル可能
        const isWorking = assigned.includes(s.id);

        // クラス割り当て
        if (isWorking) {
          cell.textContent = "出勤";
          cell.className = "working-cell";
          // mandatory bold
          if (s.mandatoryWorkDays.includes(`${currentYear}-${currentMonth}-${d}`)) {
            cell.classList.add("working-mandatory");
          }
        } else {
          cell.textContent = "休み";
          cell.className = "rest-cell";
          if (s.absoluteDaysOff.includes(`${currentYear}-${currentMonth}-${d}`)) {
            cell.classList.add("rest-absolute");
          } else if (s.requestedDaysOff.includes(`${currentYear}-${currentMonth}-${d}`)) {
            cell.classList.add("rest-requested");
          }
        }

        // 4連勤2回以上 → purple
        const highlightSet = fourConsecutiveHighlightMap[s.id];
        if (highlightSet && highlightSet.has(d)) {
          // そのスタッフが 2回以上4連勤を持ち、かつこの日がどこかの4連勤ブロックに含まれる
          cell.classList.add("purple-highlight");
        }

        // クリックで出勤⇔休みトグル
        cell.addEventListener("click", () => toggleShiftCell(s.id, d));

        row.appendChild(cell);
      });

      // 出勤人数
      const countCell = document.createElement("td");
      countCell.textContent = assigned.length;
      if (assigned.length < needed) {
        countCell.className = "needed-attention";
      }
      row.appendChild(countCell);

      // 必要人数
      const neededCell = document.createElement("td");
      neededCell.textContent = needed;
      row.appendChild(neededCell);

      tbody.appendChild(row);
    }
    table.appendChild(tbody);

    tableContainer.appendChild(table);
    resultDiv.appendChild(tableContainer);

    // 休日数サマリー
    const summaryTitle = document.createElement("h3");
    summaryTitle.className = "font-medium mb-2 mt-6";
    summaryTitle.textContent = "休日数サマリー";
    resultDiv.appendChild(summaryTitle);

    const summaryTable = document.createElement("table");
    summaryTable.className = "table summary-table";

    const summaryThead = document.createElement("thead");
    const summaryHeadRow = document.createElement("tr");
    ["スタッフ", "必要休日数", "実際の休日数", "希望休の達成率"].forEach((txt) => {
      const th = document.createElement("th");
      th.textContent = txt;
      summaryHeadRow.appendChild(th);
    });
    summaryThead.appendChild(summaryHeadRow);
    summaryTable.appendChild(summaryThead);

    const summaryTbody = document.createElement("tbody");
    staffList.forEach((s) => {
      const tr = document.createElement("tr");

      // 名前
      const tdName = document.createElement("td");
      tdName.textContent = s.name;
      tr.appendChild(tdName);

      // 必要休日数
      const tdReqOff = document.createElement("td");
      tdReqOff.textContent = s.requiredDaysOff;
      tr.appendChild(tdReqOff);

      // 実際の休日数
      const workingDays = Object.keys(generatedShift)
        .map((k) => parseInt(k))
        .filter((k) => generatedShift[k].includes(s.id));
      const actualOff = daysInMonthCount - workingDays.length;

      const tdActualOff = document.createElement("td");
      tdActualOff.textContent = actualOff;
      if (actualOff < s.requiredDaysOff) {
        tdActualOff.className = "too-few-off";
      }
      tr.appendChild(tdActualOff);

      // 希望休達成率
      const requestedOffDays = s.requestedDaysOff.filter((ds) => {
        const [y, m, dd] = ds.split("-").map(Number);
        return y === currentYear && m === currentMonth && dd <= daysInMonthCount;
      });
      const reqOffNum = requestedOffDays.map((ds) => parseInt(ds.split("-")[2]));
      const achieved = reqOffNum.filter((day) => !workingDays.includes(day));
      const rate = reqOffNum.length > 0
        ? Math.round((achieved.length / reqOffNum.length) * 100)
        : 100;

      const tdRate = document.createElement("td");
      tdRate.textContent = `${rate}% (${achieved.length}/${reqOffNum.length})`;
      tr.appendChild(tdRate);

      summaryTbody.appendChild(tr);
    });
    summaryTable.appendChild(summaryTbody);

    resultDiv.appendChild(summaryTable);

    mainWrapper.appendChild(resultDiv);
  }

  container.appendChild(mainWrapper);

  // 最後に state を保存
  saveStateToLocalStorage();
}

/**********************************************
 * アイコンSVG (Lucide風)
 **********************************************/
function chevronLeftIconSVG(size = 24) {
  return `
<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24">
  <polyline points="15 18 9 12 15 6"></polyline>
</svg>`;
}
function chevronRightIconSVG(size = 24) {
  return `
<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24">
  <polyline points="9 18 15 12 9 6"></polyline>
</svg>`;
}
function plusIconSVG(size = 24) {
  return `
<svg class="svg-icon mr-1" width="${size}" height="${size}" viewBox="0 0 24 24">
  <line x1="12" y1="5" x2="12" y2="19"></line>
  <line x1="5" y1="12" x2="19" y2="12"></line>
</svg>`;
}
function trashIconSVG(size = 24) {
  return `
<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24">
  <polyline points="3 6 5 6 21 6"></polyline>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
  <line x1="10" y1="11" x2="10" y2="17"></line>
  <line x1="14" y1="11" x2="14" y2="17"></line>
</svg>`;
}
function calendarIconSVG(size = 24) {
  return `
<svg class="svg-icon mr-2" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
  <line x1="16" y1="2" x2="16" y2="6"></line>
  <line x1="8" y1="2" x2="8" y2="6"></line>
  <line x1="3" y1="10" x2="21" y2="10"></line>
</svg>`;
}

/**********************************************
 * 初期表示
 **********************************************/
document.addEventListener("DOMContentLoaded", () => {
  loadStateFromLocalStorage();
  render();
});
