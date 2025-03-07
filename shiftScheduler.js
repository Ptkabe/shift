/*************************
 * グローバル状態 (State)
 *************************/
const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth() + 1;

// 基本必要スタッフ数
let requiredStaff = 3;

// 日別必要スタッフ数を保持するオブジェクト
let dailyRequiredStaff = {};

// スタッフ配列（絶対休み等の希望条件をもつ）
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

// 生成されたシフト結果 { dayNumber: [staffId1, staffId2, ...], ... }
let generatedShift = null;

/*******************************************
 * 日付関連のユーティリティ関数
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

  // シフト結果
  const shiftTable = {};
  dates.forEach((day) => {
    shiftTable[day] = [];
  });

  // スタッフの出勤可能日
  const staffAvailability = staffList.map((s) => {
    const availableDays = dates.filter((day) => {
      const dateStr = `${currentYear}-${currentMonth}-${day}`;
      return !s.absoluteDaysOff.includes(dateStr);
    });
    return { ...s, availableDays };
  });

  // 1) mandatory を先に割り当て
  dates.forEach((day) => {
    const dateStr = `${currentYear}-${currentMonth}-${day}`;
    const requiredForDay = dailyRequiredStaff[day] ?? requiredStaff;

    // 必須出勤スタッフID
    const mandatoryIds = staffAvailability
      .filter((s) => s.mandatoryWorkDays.includes(dateStr))
      .map((s) => s.id);

    // まず必須を配置
    shiftTable[day] = [...mandatoryIds];

    let remainingRequired = requiredForDay - mandatoryIds.length;
    if (remainingRequired > 0) {
      // 希望休でない人を優先するためのソート
      const sortedStaff = staffAvailability
        .filter(
          (s) =>
            !shiftTable[day].includes(s.id) &&
            !s.absoluteDaysOff.includes(dateStr)
        )
        .sort((a, b) => {
          const aRequested = a.requestedDaysOff.includes(dateStr) ? 1 : 0;
          const bRequested = b.requestedDaysOff.includes(dateStr) ? 1 : 0;
          if (aRequested !== bRequested) {
            return aRequested - bRequested;
          }
          // 必要休日数が多いスタッフはあとで働いてもらう
          return a.requiredDaysOff - b.requiredDaysOff;
        });

      const additionalStaff = sortedStaff.slice(0, remainingRequired).map((s) => s.id);
      shiftTable[day] = [...shiftTable[day], ...additionalStaff];
    }
  });

  // 2) 休日数が足りない人を調整
  staffList.forEach((s) => {
    const workingDays = Object.keys(shiftTable)
      .map((d) => parseInt(d))
      .filter((d) => shiftTable[d].includes(s.id));
    const daysOff = daysInMonth - workingDays.length;

    if (daysOff < s.requiredDaysOff) {
      const needMoreOff = s.requiredDaysOff - daysOff;

      // 調整できる日を探す(必須出勤じゃない、希望休を優先的に休ませる、人数多い日から外す、など)
      const adjustableDays = workingDays
        .filter((day) => {
          const dateStr = `${currentYear}-${currentMonth}-${day}`;
          return !s.mandatoryWorkDays.includes(dateStr);
        })
        .sort((a, b) => {
          // 希望休の日を優先的に外す
          const aReq = s.requestedDaysOff.includes(
            `${currentYear}-${currentMonth}-${a}`
          )
            ? -1
            : 0;
          const bReq = s.requestedDaysOff.includes(
            `${currentYear}-${currentMonth}-${b}`
          )
            ? -1
            : 0;
          if (aReq !== bReq) {
            return aReq - bReq;
          }
          // 出勤人数が多い日を先に外す
          return shiftTable[b].length - shiftTable[a].length;
        });

      for (let i = 0; i < Math.min(needMoreOff, adjustableDays.length); i++) {
        const day = adjustableDays[i];
        shiftTable[day] = shiftTable[day].filter((id) => id !== s.id);
      }
    }
  });

  generatedShift = shiftTable;
  render(); // 再描画
}

/*******************************************
 * テーブルセルの出勤/休みトグル
 *******************************************/
function toggleShiftCell(staffId, day) {
  if (!generatedShift) return;
  const assigned = generatedShift[day] || [];
  // すでに出勤に入っていれば -> 休みにする(配列から除外)
  // いなければ -> 出勤に追加
  if (assigned.includes(staffId)) {
    generatedShift[day] = assigned.filter((id) => id !== staffId);
  } else {
    generatedShift[day] = [...assigned, staffId];
  }
  render(); // 再描画し、サマリーなども更新
}

/*******************************************
 * イベントハンドラ
 *******************************************/
function goToPreviousMonth() {
  if (currentMonth === 1) {
    currentMonth = 12;
    currentYear -= 1;
  } else {
    currentMonth -= 1;
  }
  generatedShift = null; // リセット
  render();
}

function goToNextMonth() {
  if (currentMonth === 12) {
    currentMonth = 1;
    currentYear += 1;
  } else {
    currentMonth += 1;
  }
  generatedShift = null; // リセット
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
  const newId =
    staffList.length > 0 ? Math.max(...staffList.map((s) => s.id)) + 1 : 1;
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

    const hasAbs = s.absoluteDaysOff.includes(dateStr);
    const hasReq = s.requestedDaysOff.includes(dateStr);
    const hasMan = s.mandatoryWorkDays.includes(dateStr);

    let updated = { ...s };

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
  titleEl.textContent = "シフトスケジューラー";
  mainWrapper.appendChild(titleEl);

  /***************************************
   * 基本設定
   ***************************************/
  const basicSection = document.createElement("div");
  basicSection.className = "section mb-8";

  const basicTitle = document.createElement("h2");
  basicTitle.className = "section-title";
  basicTitle.textContent = "基本設定";
  basicSection.appendChild(basicTitle);

  // 年月ナビ
  const navRow = document.createElement("div");
  navRow.className = "flex mb-4";

  // 左ブロック(前月/現在/翌月)
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

  // 右ブロック(基本必要スタッフ数)
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
  staffInput.className = "input-text";
  staffInput.addEventListener("change", onChangeRequiredStaff);
  rightDiv.appendChild(staffInput);

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

    const dow = getDayOfWeek(currentYear, currentMonth, d);
    const label = document.createElement("div");
    label.className =
      "mb-1 font-medium " + (dow === "土" ? "text-saturday" : dow === "日" ? "text-sunday" : "");
    label.textContent = `${d}(${dow})`;
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

  /***************************************
   * スタッフ設定
   ***************************************/
  const staffSection = document.createElement("div");
  staffSection.className = "mb-8";

  // 見出しと追加ボタン
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

  // スタッフカード
  staffList.forEach((s) => {
    const staffCard = document.createElement("div");
    staffCard.className = "section mb-4";

    // 上段: 名前 + 必要休日数 + 削除
    const cardTop = document.createElement("div");
    cardTop.className = "flex-between mb-2";

    const leftBox = document.createElement("div");
    leftBox.className = "flex";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = s.name;
    nameInput.className = "input-text mr-4";
    nameInput.style.width = "auto"; // 名前用に伸びやすく
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
    staffCard.appendChild(cardTop);

    // ラベル欄
    const labelsRow = document.createElement("div");
    labelsRow.className = "flex mb-2 text-sm";
    labelsRow.innerHTML = `
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
    staffCard.appendChild(labelsRow);

    // 日付グリッド
    const dateGrid = document.createElement("div");
    dateGrid.className = "grid-7";

    for (let d = 1; d <= daysInMonthCount; d++) {
      const cell = document.createElement("div");
      cell.className = "text-center";

      const dow = getDayOfWeek(currentYear, currentMonth, d);
      const dayLabel = document.createElement("div");
      dayLabel.className =
        "mb-1 text-sm " + (dow === "土" ? "text-saturday" : dow === "日" ? "text-sunday" : "");
      dayLabel.textContent = d;
      cell.appendChild(dayLabel);

      const btnBox = document.createElement("div");
      btnBox.style.display = "flex";
      btnBox.style.flexDirection = "column";
      btnBox.style.gap = "4px";

      // 絶対休
      const absBtn = document.createElement("button");
      absBtn.className = "circle-button " +
        (s.absoluteDaysOff.includes(`${currentYear}-${currentMonth}-${d}`)
          ? "bg-absolute-off"
          : "hover-absolute-off");
      absBtn.title = "絶対休み";
      absBtn.addEventListener("click", () => toggleDate(s.id, d, "absolute"));
      btnBox.appendChild(absBtn);

      // 希望休
      const reqBtn = document.createElement("button");
      reqBtn.className = "circle-button " +
        (s.requestedDaysOff.includes(`${currentYear}-${currentMonth}-${d}`)
          ? "bg-requested-off"
          : "hover-requested-off");
      reqBtn.title = "希望休";
      reqBtn.addEventListener("click", () => toggleDate(s.id, d, "requested"));
      btnBox.appendChild(reqBtn);

      // 必ず出勤
      const manBtn = document.createElement("button");
      manBtn.className = "circle-button " +
        (s.mandatoryWorkDays.includes(`${currentYear}-${currentMonth}-${d}`)
          ? "bg-mandatory"
          : "hover-mandatory");
      manBtn.title = "必ず出勤";
      manBtn.addEventListener("click", () => toggleDate(s.id, d, "mandatory"));
      btnBox.appendChild(manBtn);

      cell.appendChild(btnBox);
      dateGrid.appendChild(cell);
    }
    staffCard.appendChild(dateGrid);

    staffSection.appendChild(staffCard);
  });

  mainWrapper.appendChild(staffSection);

  /***************************************
   * シフト生成ボタン
   ***************************************/
  const genBtnWrapper = document.createElement("div");
  genBtnWrapper.className = "text-center mb-8";

  const genBtn = document.createElement("button");
  genBtn.className = "button button-icon";
  genBtn.innerHTML = calendarIconSVG(20) + "シフト表を生成";
  genBtn.addEventListener("click", generateShift);
  genBtnWrapper.appendChild(genBtn);

  mainWrapper.appendChild(genBtnWrapper);

  /***************************************
   * 生成されたシフト表
   ***************************************/
  if (generatedShift) {
    const resultDiv = document.createElement("div");
    resultDiv.className = "mb-8";

    // 見出し
    const resultTitle = document.createElement("h2");
    resultTitle.className = "section-title mb-4";
    resultTitle.textContent = "生成されたシフト表 (セルをクリックでトグルできます)";
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

      const dateCell = document.createElement("td");
      dateCell.textContent = `${d}日(${dw})`;
      dateCell.className = "font-medium";
      row.appendChild(dateCell);

      const assigned = generatedShift[d] || [];
      const needed = dailyRequiredStaff[d] ?? requiredStaff;

      staffList.forEach((s) => {
        const cell = document.createElement("td");
        const isWorking = assigned.includes(s.id);
        const dateStr = `${currentYear}-${currentMonth}-${d}`;
        const isAbsOff = s.absoluteDaysOff.includes(dateStr);
        const isReqOff = s.requestedDaysOff.includes(dateStr);
        const isMan = s.mandatoryWorkDays.includes(dateStr);

        // テキスト
        if (isWorking) {
          cell.textContent = "出勤";
          cell.className = "working-cell";
          if (isMan) {
            cell.classList.add("working-mandatory");
          }
        } else {
          cell.textContent = "休み";
          cell.className = "rest-cell";
          if (isAbsOff) {
            cell.classList.add("rest-absolute");
          } else if (isReqOff) {
            cell.classList.add("rest-requested");
          }
        }

        // **セルクリックでトグルする！**
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => toggleShiftCell(s.id, d));

        row.appendChild(cell);
      });

      const assignedCountCell = document.createElement("td");
      assignedCountCell.textContent = assigned.length;
      if (assigned.length < needed) {
        assignedCountCell.className = "needed-attention";
      }
      row.appendChild(assignedCountCell);

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

    // thead
    const summaryThead = document.createElement("thead");
    const summaryHeadRow = document.createElement("tr");

    ["スタッフ", "必要休日数", "実際の休日数", "希望休の達成率"].forEach((text) => {
      const th = document.createElement("th");
      th.textContent = text;
      summaryHeadRow.appendChild(th);
    });
    summaryThead.appendChild(summaryHeadRow);
    summaryTable.appendChild(summaryThead);

    // tbody
    const summaryTbody = document.createElement("tbody");
    staffList.forEach((s) => {
      const row = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = s.name;
      row.appendChild(tdName);

      const tdNeedOff = document.createElement("td");
      tdNeedOff.textContent = s.requiredDaysOff;
      row.appendChild(tdNeedOff);

      // 実際の休日数
      const workingDays = Object.keys(generatedShift)
        .map((d) => parseInt(d))
        .filter((d) => generatedShift[d].includes(s.id));
      const actualOff = daysInMonthCount - workingDays.length;

      const tdActualOff = document.createElement("td");
      tdActualOff.textContent = actualOff;
      if (actualOff < s.requiredDaysOff) {
        tdActualOff.className = "too-few-off";
      }
      row.appendChild(tdActualOff);

      // 希望休達成率
      const requestedOffDays = s.requestedDaysOff.filter((ds) => {
        const [y, m, dd] = ds.split("-").map((x) => parseInt(x));
        return y === currentYear && m === currentMonth && dd <= daysInMonthCount;
      });
      const requestedDayNums = requestedOffDays.map((ds) => parseInt(ds.split("-")[2]));
      const achieved = requestedDayNums.filter((day) => !workingDays.includes(day));
      const rate =
        requestedDayNums.length > 0
          ? Math.round((achieved.length / requestedDayNums.length) * 100)
          : 100;

      const tdRate = document.createElement("td");
      tdRate.textContent = `${rate}% (${achieved.length}/${requestedDayNums.length})`;
      row.appendChild(tdRate);

      summaryTbody.appendChild(row);
    });
    summaryTable.appendChild(summaryTbody);

    resultDiv.appendChild(summaryTable);

    // シフト表保存ボタン（ダミー）
    const saveDiv = document.createElement("div");
    saveDiv.className = "mt-6 text-right";

    const saveBtn = document.createElement("button");
    saveBtn.className = "button button-icon";
    saveBtn.innerHTML = saveIconSVG(20) + "シフト表を保存";
    saveBtn.addEventListener("click", () => {
      alert("シフト表を保存する処理を実装してね。");
    });

    saveDiv.appendChild(saveBtn);
    resultDiv.appendChild(saveDiv);

    mainWrapper.appendChild(resultDiv);
  }

  container.appendChild(mainWrapper);
}

/**********************************************
 * アイコン用の SVG (Lucide風)
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
function saveIconSVG(size = 24) {
  return `
<svg class="svg-icon mr-2" width="${size}" height="${size}" viewBox="0 0 24 24">
  <path d="M19 21H5a2 2 0 0 1-2-2V5
           a2 2 0 0 1 2-2h11l5 5v11
           a2 2 0 0 1-2 2z"></path>
  <polyline points="17 21 17 13 7 13 7 21"></polyline>
  <polyline points="7 3 7 8 15 8"></polyline>
</svg>`;
}

/**********************************************
 * 初期ロード時
 **********************************************/
document.addEventListener("DOMContentLoaded", () => {
  render();
});
