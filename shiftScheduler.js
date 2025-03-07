/*************************
 * グローバル状態 (State)
 *************************/
const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth() + 1;

// 基本必要スタッフ数
let requiredStaff = 3;
// 日別必要スタッフ数
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

// 生成されたシフト結果 { day: [staffId1, staffId2, ...], ... }
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

  const shiftTable = {};
  dates.forEach((day) => {
    shiftTable[day] = [];
  });

  // スタッフごとに、「絶対休みでない日」を availableDays に持たせる
  const staffAvailability = staffList.map((s) => {
    const availableDays = dates.filter((d) => {
      const dateStr = `${currentYear}-${currentMonth}-${d}`;
      return !s.absoluteDaysOff.includes(dateStr);
    });
    return { ...s, availableDays };
  });

  // 1) mandatory の割り当て
  dates.forEach((day) => {
    const dateStr = `${currentYear}-${currentMonth}-${day}`;
    const needed = dailyRequiredStaff[day] ?? requiredStaff;

    // 必須出勤スタッフ
    const mandatoryIds = staffAvailability
      .filter((s) => s.mandatoryWorkDays.includes(dateStr))
      .map((s) => s.id);

    // まず必須を配置
    shiftTable[day] = [...mandatoryIds];

    // 必要数に達してなければ追加で埋める
    let remain = needed - mandatoryIds.length;
    if (remain > 0) {
      // 希望休を避けたいので sort
      const sorted = staffAvailability
        .filter(
          (s) => 
            !shiftTable[day].includes(s.id) &&
            !s.absoluteDaysOff.includes(dateStr)
        )
        .sort((a, b) => {
          const aReq = a.requestedDaysOff.includes(dateStr) ? 1 : 0;
          const bReq = b.requestedDaysOff.includes(dateStr) ? 1 : 0;
          if (aReq !== bReq) return aReq - bReq;
          // 必要休日数が多いスタッフは後に
          return a.requiredDaysOff - b.requiredDaysOff;
        });
      const add = sorted.slice(0, remain).map((s) => s.id);
      shiftTable[day].push(...add);
    }
  });

  // 2) 必要休日数に満たないスタッフを調整
  staffList.forEach((s) => {
    const working = Object.keys(shiftTable)
      .map((day) => parseInt(day))
      .filter((day) => shiftTable[day].includes(s.id));
    const actualOff = daysInMonth - working.length;

    if (actualOff < s.requiredDaysOff) {
      const needOffMore = s.requiredDaysOff - actualOff;

      const adjustableDays = working
        .filter((day) => {
          const dateStr = `${currentYear}-${currentMonth}-${day}`;
          // 必須出勤日は外せない
          return !s.mandatoryWorkDays.includes(dateStr);
        })
        .sort((a, b) => {
          // 希望休の日を優先的に外す
          const aReq = s.requestedDaysOff.includes(
            `${currentYear}-${currentMonth}-${a}`
          ) ? -1 : 0;
          const bReq = s.requestedDaysOff.includes(
            `${currentYear}-${currentMonth}-${b}`
          ) ? -1 : 0;
          if (aReq !== bReq) return aReq - bReq;

          // その日の出勤人数が多い日を先に外す
          return shiftTable[b].length - shiftTable[a].length;
        });

      for (let i = 0; i < Math.min(needOffMore, adjustableDays.length); i++) {
        const d = adjustableDays[i];
        shiftTable[d] = shiftTable[d].filter((id) => id !== s.id);
      }
    }
  });

  // 生成したシフトを反映
  generatedShift = shiftTable;

  // 3) 連勤チェック
  checkConsecutiveWorkConstraints();

  // 画面更新
  render();
}

/*******************************************
 * 「四連勤1回までOK、それ以上(5連勤)はNG」チェック
 *******************************************/
function checkConsecutiveWorkConstraints() {
  if (!generatedShift) return;

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const warnings = [];

  // 全スタッフをループ
  staffList.forEach((s) => {
    let consecutiveCount = 0;
    let fourDayBlockCount = 0; // 4連勤ブロックの数

    for (let d = 1; d <= daysInMonth; d++) {
      const assigned = generatedShift[d] || [];
      const isWorking = assigned.includes(s.id);

      if (isWorking) {
        consecutiveCount++;
      } else {
        // 連勤終了
        if (consecutiveCount === 4) {
          fourDayBlockCount++;
        }
        if (consecutiveCount >= 5) {
          warnings.push(
            `【${s.name}】が${consecutiveCount}連勤（${d - consecutiveCount}日～${d - 1}日）`
          );
        }
        consecutiveCount = 0;
      }
    }
    // 月末で連勤が終わらない可能性もあるので、最後にもチェック
    if (consecutiveCount === 4) {
      fourDayBlockCount++;
    }
    if (consecutiveCount >= 5) {
      warnings.push(
        `【${s.name}】が${consecutiveCount}連勤（${daysInMonth - consecutiveCount + 1}日～${daysInMonth}日）`
      );
    }

    // 4連勤ブロックが2回以上あれば警告
    if (fourDayBlockCount > 1) {
      warnings.push(`【${s.name}】は4連勤が${fourDayBlockCount}回発生`);
    }
  });

  // もし違反があればまとめて alert
  if (warnings.length > 0) {
    let message = "連勤制限に違反がありました。\n\n";
    message += warnings.join("\n");
    alert(message);
  }
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
  render();
}

function onChangeRequiredStaff(e) {
  requiredStaff = parseInt(e.target.value, 10) || 1;
  render();
}

function onChangeDailyStaffRequirement(day, e) {
  dailyRequiredStaff[day] = parseInt(e.target.value, 10) || requiredStaff;
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
    const hasAbs = updated.absoluteDaysOff.includes(dateStr);
    const hasReq = updated.requestedDaysOff.includes(dateStr);
    const hasMan = updated.mandatoryWorkDays.includes(dateStr);

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

  // 大枠
  const mainWrapper = document.createElement("div");
  mainWrapper.className = "scheduler-container";

  // タイトル
  const titleEl = document.createElement("h1");
  titleEl.className = "scheduler-title";
  titleEl.textContent = "シフトスケジューラー (連勤チェック付き)";
  mainWrapper.appendChild(titleEl);

  /**********************************
   * 基本設定
   **********************************/
  const basicSection = document.createElement("div");
  basicSection.className = "section mb-8";

  const basicTitle = document.createElement("h2");
  basicTitle.className = "section-title";
  basicTitle.textContent = "基本設定";
  basicSection.appendChild(basicTitle);

  const navRow = document.createElement("div");
  navRow.className = "flex mb-4";

  // 左ナビ (前月/年月/翌月)
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

  // 右ブロック (基本必要スタッフ数)
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

  /**********************************
   * スタッフ設定
   **********************************/
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

  // スタッフ一覧カード
  staffList.forEach((s) => {
    const staffCard = document.createElement("div");
    staffCard.className = "section mb-4";

    // 上段: 名前入力 + 必要休日数 + 削除ボタン
    const topRow = document.createElement("div");
    topRow.className = "flex-between mb-2";

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

    const reqLabel = document.createElement("label");
    reqLabel.className = "mr-2 font-medium";
    reqLabel.textContent = "必要休日数:";
    leftBox.appendChild(reqLabel);

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

    topRow.appendChild(leftBox);

    const delBtn = document.createElement("button");
    delBtn.className = "icon-button";
    delBtn.innerHTML = trashIconSVG(18);
    delBtn.addEventListener("click", () => removeStaff(s.id));
    topRow.appendChild(delBtn);

    staffCard.appendChild(topRow);

    // 絶対休・希望休・必ず出勤 のラベル
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
    staffCard.appendChild(labelRow);

    // 日付グリッド
    const dateGrid = document.createElement("div");
    dateGrid.className = "grid-7";

    for (let d = 1; d <= daysInMonthCount; d++) {
      const cell = document.createElement("div");
      cell.className = "text-center";

      const dw = getDayOfWeek(currentYear, currentMonth, d);
      const dayLabel = document.createElement("div");
      dayLabel.className =
        "mb-1 text-sm " + (dw === "土" ? "text-saturday" : dw === "日" ? "text-sunday" : "");
      dayLabel.textContent = d;
      cell.appendChild(dayLabel);

      const btnBox = document.createElement("div");
      btnBox.style.display = "flex";
      btnBox.style.flexDirection = "column";
      btnBox.style.gap = "4px";

      // 絶対休み
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

    staffCard.appendChild(dateGrid);
    staffSection.appendChild(staffCard);
  });

  mainWrapper.appendChild(staffSection);

  /**********************************
   * シフト生成ボタン
   **********************************/
  const genBtnWrapper = document.createElement("div");
  genBtnWrapper.className = "text-center mb-8";

  const genBtn = document.createElement("button");
  genBtn.className = "button button-icon";
  genBtn.innerHTML = calendarIconSVG(20) + "シフト表を生成";
  genBtn.addEventListener("click", generateShift);
  genBtnWrapper.appendChild(genBtn);

  mainWrapper.appendChild(genBtnWrapper);

  /**********************************
   * 生成されたシフト表
   **********************************/
  if (generatedShift) {
    const resultDiv = document.createElement("div");
    resultDiv.className = "mb-8";

    const resultTitle = document.createElement("h2");
    resultTitle.className = "section-title mb-4";
    resultTitle.textContent = "生成されたシフト表 (連勤制限をチェック済み)";
    resultDiv.appendChild(resultTitle);

    const tableContainer = document.createElement("div");
    tableContainer.className = "table-container";

    const table = document.createElement("table");
    table.className = "table";

    // thead
    const thead = document.createElement("thead");
    const trHeader = document.createElement("tr");

    const thDate = document.createElement("th");
    thDate.textContent = "日付";
    trHeader.appendChild(thDate);

    staffList.forEach((s) => {
      const th = document.createElement("th");
      th.textContent = s.name;
      trHeader.appendChild(th);
    });

    const thCount = document.createElement("th");
    thCount.textContent = "出勤人数";
    trHeader.appendChild(thCount);

    const thNeeded = document.createElement("th");
    thNeeded.textContent = "必要人数";
    trHeader.appendChild(thNeeded);

    thead.appendChild(trHeader);
    table.appendChild(thead);

    // tbody
    const tbody = document.createElement("tbody");
    for (let d = 1; d <= daysInMonthCount; d++) {
      const row = document.createElement("tr");
      const dow = getDayOfWeek(currentYear, currentMonth, d);
      if (dow === "土") {
        row.style.backgroundColor = "var(--color-saturday-bg)";
      } else if (dow === "日") {
        row.style.backgroundColor = "var(--color-sunday-bg)";
      }

      const dateCell = document.createElement("td");
      dateCell.textContent = `${d}日(${dow})`;
      dateCell.className = "font-medium";
      row.appendChild(dateCell);

      const assignedStaffIds = generatedShift[d] || [];
      const needed = dailyRequiredStaff[d] ?? requiredStaff;

      // スタッフ列
      staffList.forEach((s) => {
        const cell = document.createElement("td");
        const isWorking = assignedStaffIds.includes(s.id);
        const dateStr = `${currentYear}-${currentMonth}-${d}`;
        const isAbsOff = s.absoluteDaysOff.includes(dateStr);
        const isReqOff = s.requestedDaysOff.includes(dateStr);
        const isMan = s.mandatoryWorkDays.includes(dateStr);

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
        row.appendChild(cell);
      });

      // 出勤人数
      const staffCountCell = document.createElement("td");
      staffCountCell.textContent = assignedStaffIds.length;
      if (assignedStaffIds.length < needed) {
        staffCountCell.className = "needed-attention";
      }
      row.appendChild(staffCountCell);

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

    // thead
    const summaryThead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["スタッフ", "必要休日数", "実際の休日数", "希望休の達成率"].forEach((txt) => {
      const th = document.createElement("th");
      th.textContent = txt;
      headRow.appendChild(th);
    });
    summaryThead.appendChild(headRow);
    summaryTable.appendChild(summaryThead);

    // tbody
    const summaryTbody = document.createElement("tbody");
    staffList.forEach((s) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = s.name;
      tr.appendChild(tdName);

      const tdNeedOff = document.createElement("td");
      tdNeedOff.textContent = s.requiredDaysOff;
      tr.appendChild(tdNeedOff);

      // 実際の休日数
      const workingDays = Object.keys(generatedShift)
        .map((k) => parseInt(k))
        .filter((day) => generatedShift[day].includes(s.id));
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
      const requestedDayNums = requestedOffDays.map((ds) => parseInt(ds.split("-")[2]));
      const achievedReq = requestedDayNums.filter((day) => !workingDays.includes(day));
      const rate =
        requestedDayNums.length > 0
          ? Math.round((achievedReq.length / requestedDayNums.length) * 100)
          : 100;

      const tdRate = document.createElement("td");
      tdRate.textContent = `${rate}% (${achievedReq.length}/${requestedDayNums.length})`;
      tr.appendChild(tdRate);

      summaryTbody.appendChild(tr);
    });
    summaryTable.appendChild(summaryTbody);

    resultDiv.appendChild(summaryTable);

    mainWrapper.appendChild(resultDiv);
  }

  container.appendChild(mainWrapper);
}

/**********************************************
 * アイコン用のSVG
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
  render();
});
