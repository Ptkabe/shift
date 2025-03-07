/*************************
 * グローバル状態
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

// シフト結果 { day: [staffId, staffId...], ... }
let generatedShift = null;

// 「4連勤が2回以上あるスタッフの日付を紫ハイライト」するためのデータ
let highlightDaysForStaff = {};

// ロックした日(行)を管理するSet
// ここに含まれている日付はクリックしても出勤/休みをトグルできない
let lockedDays = new Set();

/*******************************************
 * localStorage 読み書き
 *******************************************/
function loadStateFromLocalStorage() {
  const saved = localStorage.getItem("myAdvancedShiftData");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.currentYear) currentYear = parsed.currentYear;
      if (parsed.currentMonth) currentMonth = parsed.currentMonth;
      if (typeof parsed.requiredStaff === "number") requiredStaff = parsed.requiredStaff;
      if (parsed.dailyRequiredStaff) dailyRequiredStaff = parsed.dailyRequiredStaff;
      if (parsed.staffList) staffList = parsed.staffList;
      if (parsed.generatedShift) generatedShift = parsed.generatedShift;
      if (parsed.highlightDaysForStaff) highlightDaysForStaff = parsed.highlightDaysForStaff;
      if (parsed.lockedDays) lockedDays = new Set(parsed.lockedDays);
    } catch (e) {
      console.error("Failed to parse localStorage:", e);
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
    highlightDaysForStaff,
    lockedDays: Array.from(lockedDays),
  };
  localStorage.setItem("myAdvancedShiftData", JSON.stringify(data));
}

/*******************************************
 * リセットボタン
 *******************************************/
function resetAllData() {
  const ok = confirm("本当にリセットしますか？");
  if (!ok) return;
  localStorage.removeItem("myAdvancedShiftData");

  // デフォルト値に戻す
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
  highlightDaysForStaff = {};
  lockedDays = new Set();

  render();
}

/*******************************************
 * 日付ユーティリティ
 *******************************************/
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
function getDayOfWeek(year, month, day) {
  const date = new Date(year, month - 1, day);
  const days = ["日","月","火","水","木","金","土"];
  return days[date.getDay()];
}
function isWeekend(year, month, day) {
  // 土日かどうか
  const w = getDayOfWeek(year, month, day);
  return (w === "土" || w === "日");
}

/*******************************************
 * シフト生成 (均等に/4連勤抑制/週末休み考慮) の簡易実装
 *******************************************/
function generateShift() {
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const shiftTable = {};
  for (let d=1; d<=daysInMonth; d++) {
    shiftTable[d] = [];
  }

  // 日ごとに必要スタッフ数に達するまで追加
  for (let d=1; d<=daysInMonth; d++) {
    if (lockedDays.has(d)) {
      // ロックされた日は何もしない(既存シフトを維持したまま or null)
      // 既にgeneratedShiftがあればそれを継続しよう
      if (generatedShift && generatedShift[d]) {
        shiftTable[d] = [...generatedShift[d]];
      }
      continue;
    }

    const needed = dailyRequiredStaff[d] ?? requiredStaff;

    // mandatory の人を先に配置
    const dateStr = `${currentYear}-${currentMonth}-${d}`;
    let mandatoryStaff = staffList.filter(s => s.mandatoryWorkDays.includes(dateStr));
    mandatoryStaff.forEach(s => {
      shiftTable[d].push(s.id);
    });
    let remain = needed - mandatoryStaff.length;
    if (remain <= 0) continue; // 必要人数満たした

    // それ以外を、できるだけ均等に + 制限に違反しないよう順次追加
    // "土日どちらかの休みを2回以上"考慮：まだ週末休みが2未満の人は極力週末勤務を避けたい
    let candidates = staffList
      .filter(s => 
        !shiftTable[d].includes(s.id) &&   // まだ入ってない
        !s.absoluteDaysOff.includes(dateStr) // 絶対休みじゃない
      )
      .sort((a,b) => {
        // すでに割り当て済みの日数が少ない順に並べる(=より働いてない人を優先)
        const aWorkCount = countWorkingDays(shiftTable, a.id);
        const bWorkCount = countWorkingDays(shiftTable, b.id);

        if (aWorkCount !== bWorkCount) {
          return aWorkCount - bWorkCount;
        }
        // 週末休みがまだ2日取れてない人は後ろの方にしよう (＝なるべく土日働かせない)
        if (isWeekend(currentYear, currentMonth, d)) {
          const aWeekendOffSoFar = countWeekendOff(shiftTable, a.id);
          const bWeekendOffSoFar = countWeekendOff(shiftTable, b.id);
          // 2日未満の人は「働いてほしくない」→ 優先度を下げる
          const aNeedWeekendOff = (aWeekendOffSoFar < 2) ? 1 : 0;
          const bNeedWeekendOff = (bWeekendOffSoFar < 2) ? 1 : 0;
          if (aNeedWeekendOff !== bNeedWeekendOff) {
            return aNeedWeekendOff - bNeedWeekendOff;
          }
        }
        return 0;
      });

    // 順次追加しながら4連勤ブロックが2回以上発生しないかをチェック
    let assignedCount = 0;
    for (let i=0; i<candidates.length && assignedCount<remain; i++) {
      const staffId = candidates[i].id;
      const tempAssigned = [...shiftTable[d], staffId];
      // 試しに入れてみて 4連勤2回以上になるかチェック
      const backup = shiftTable[d];
      shiftTable[d] = tempAssigned;
      if (!wouldCauseExcess4ConsecutiveBlocks(shiftTable, staffId)) {
        assignedCount++;
      } else {
        // もし違反するなら戻してスキップ
        shiftTable[d] = backup;
      }
    }
  }

  generatedShift = shiftTable;

  // 4連勤ブロックのハイライト更新
  highlightDaysForStaff = calculateFourConsecutiveHighlight(generatedShift);
  
  render();
}

/** staffIdが4連勤を2回以上起こすかどうかを判定する */
function wouldCauseExcess4ConsecutiveBlocks(shiftTable, staffId) {
  // 一旦4連勤ブロックを数えて、2つ以上あればtrue
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  
  // 連続勤務を調べる
  let consecutive = 0;
  let fourBlocks = [];
  for (let d=1; d<=daysInMonth; d++) {
    const isWorking = shiftTable[d]?.includes(staffId);
    if (isWorking) {
      consecutive++;
    } else {
      if (consecutive >= 4) {
        // 連勤ブロックを全部カウント
        for (let offset=0; offset <= consecutive-4; offset++){
          fourBlocks.push([d-4-offset, d-1-offset]);
        }
      }
      consecutive=0;
    }
  }
  // 月末まで連勤が続く場合
  if (consecutive >=4) {
    const lastDay = daysInMonth;
    for (let offset=0; offset <= consecutive-4; offset++){
      fourBlocks.push([lastDay-4-offset+1, lastDay-offset]);
    }
  }
  // 4連勤ブロックが2つ以上あればダメ
  return (fourBlocks.length >= 2);
}

/** shiftTable上で staffId の出勤日数を数える */
function countWorkingDays(shiftTable, staffId) {
  let count = 0;
  for (let d in shiftTable) {
    if (shiftTable[d].includes(staffId)) count++;
  }
  return count;
}

/** shiftTable上で staffId の週末休み日数を数える */
function countWeekendOff(shiftTable, staffId) {
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  let weekendOffCount = 0;
  for (let d=1; d<=daysInMonth; d++) {
    if (isWeekend(currentYear, currentMonth, d)) {
      const assigned = shiftTable[d] || [];
      if (!assigned.includes(staffId)) {
        weekendOffCount++;
      }
    }
  }
  return weekendOffCount;
}

/** 4連勤ブロックが2個以上あるスタッフの、その該当日をSetで返す */
function calculateFourConsecutiveHighlight(shift) {
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const result = {};

  for (let s of staffList) {
    let consecutive = 0;
    let blocks = [];
    for (let d=1; d<=daysInMonth; d++) {
      const isWorking = shift[d]?.includes(s.id);
      if (isWorking) {
        consecutive++;
      } else {
        if (consecutive >=4) {
          for (let offset=0; offset <= consecutive-4; offset++){
            blocks.push([d-4-offset, d-1-offset]);
          }
        }
        consecutive=0;
      }
    }
    // 月末まで連勤が続く
    if (consecutive>=4){
      for (let offset=0; offset <= consecutive-4; offset++){
        blocks.push([daysInMonth-4-offset+1, daysInMonth-offset]);
      }
    }

    if (blocks.length>=2) {
      // それらの日をまとめて紫
      const highlightSet = new Set();
      blocks.forEach(([start,end]) => {
        for(let dd=start; dd<=end; dd++){
          highlightSet.add(dd);
        }
      });
      result[s.id] = highlightSet;
    }
  }
  return result;
}

/*******************************************
 * シフト表クリックトグル
 *******************************************/
function toggleShiftCell(staffId, day) {
  // ロックされてたら操作不可
  if (!generatedShift || lockedDays.has(day)) return;

  const assigned = generatedShift[day] || [];
  if (assigned.includes(staffId)) {
    // 出勤中なら外す
    generatedShift[day] = assigned.filter(id => id!==staffId);
  } else {
    // 休みなら出勤に
    // ただし4連勤2回以上になるかチェック
    const backup = [...assigned];
    generatedShift[day] = [...assigned, staffId];

    if (wouldCauseExcess4ConsecutiveBlocks(generatedShift, staffId)) {
      // ダメなので戻す
      generatedShift[day] = backup;
    }
  }

  // ハイライト再計算
  highlightDaysForStaff = calculateFourConsecutiveHighlight(generatedShift);
  render();
}

/*******************************************
 * 「日付セル」をクリックでロック/解除
 *******************************************/
function toggleLockDay(day) {
  if (lockedDays.has(day)) {
    lockedDays.delete(day);
  } else {
    lockedDays.add(day);
  }
  render();
}

/*******************************************
 * イベント系
 *******************************************/
function goToPreviousMonth() {
  if (currentMonth===1) {
    currentMonth=12; currentYear--;
  } else {
    currentMonth--;
  }
  generatedShift=null;
  highlightDaysForStaff={};
  lockedDays=new Set();
  render();
}

function goToNextMonth() {
  if (currentMonth===12) {
    currentMonth=1; currentYear++;
  } else {
    currentMonth++;
  }
  generatedShift=null;
  highlightDaysForStaff={};
  lockedDays=new Set();
  render();
}

function onChangeRequiredStaff(e) {
  requiredStaff = parseInt(e.target.value,10) || 1;
  render();
}

function onChangeDailyStaffRequirement(day, e){
  dailyRequiredStaff[day] = parseInt(e.target.value,10) || requiredStaff;
  render();
}

function addStaff() {
  const newId = staffList.length>0 
    ? Math.max(...staffList.map(s=>s.id))+1
    : 1;
  staffList.push({
    id:newId,
    name:`新しいスタッフ ${newId}`,
    requiredDaysOff: 8,
    absoluteDaysOff: [],
    requestedDaysOff: [],
    mandatoryWorkDays: [],
  });
  render();
}

function removeStaff(staffId){
  staffList=staffList.filter(s=>s.id!==staffId);
  render();
}

function updateStaffInfo(staffId, field, value){
  staffList=staffList.map(s=>{
    if (s.id===staffId) {
      return {...s, [field]:value};
    }
    return s;
  });
  render();
}

function toggleDate(staffId, day, type){
  const dateStr = `${currentYear}-${currentMonth}-${day}`;
  staffList=staffList.map(s=>{
    if (s.id!==staffId) return s;

    let updated={...s};
    const hasAbs=s.absoluteDaysOff.includes(dateStr);
    const hasReq=s.requestedDaysOff.includes(dateStr);
    const hasMan=s.mandatoryWorkDays.includes(dateStr);

    switch(type){
      case "absolute":
        if (hasAbs) {
          updated.absoluteDaysOff = updated.absoluteDaysOff.filter(d=>d!==dateStr);
        } else {
          updated.absoluteDaysOff = [...updated.absoluteDaysOff.filter(d=>d!==dateStr), dateStr];
          updated.requestedDaysOff = updated.requestedDaysOff.filter(d=>d!==dateStr);
          updated.mandatoryWorkDays = updated.mandatoryWorkDays.filter(d=>d!==dateStr);
        }
        break;
      case "requested":
        if (hasReq) {
          updated.requestedDaysOff = updated.requestedDaysOff.filter(d=>d!==dateStr);
        } else {
          updated.requestedDaysOff = [...updated.requestedDaysOff.filter(d=>d!==dateStr), dateStr];
          updated.absoluteDaysOff = updated.absoluteDaysOff.filter(d=>d!==dateStr);
          updated.mandatoryWorkDays = updated.mandatoryWorkDays.filter(d=>d!==dateStr);
        }
        break;
      case "mandatory":
        if (hasMan) {
          updated.mandatoryWorkDays = updated.mandatoryWorkDays.filter(d=>d!==dateStr);
        } else {
          updated.mandatoryWorkDays = [...updated.mandatoryWorkDays.filter(d=>d!==dateStr), dateStr];
          updated.absoluteDaysOff = updated.absoluteDaysOff.filter(d=>d!==dateStr);
          updated.requestedDaysOff = updated.requestedDaysOff.filter(d=>d!==dateStr);
        }
        break;
      default: break;
    }
    return updated;
  });
  render();
}

/*******************************************
 * チェック＆提案
 *******************************************/
function checkAndSuggestImprovements() {
  // 1) 「土日どちらかの休みが2日以上取れているか」
  // 2) 「各日の必要人数は合っているか」(例えばピッタリ一致なのか、最低限満たしていればOKかはお好み)
  //    ここでは「最低限満たす or 超過OK」の判定をしたり、
  //    あるいは「ちょうど一致」を望むならそっちに。
  //    ここでは「ちょうど == dailyRequiredStaff[day]」にしてみる

  let messages = [];
  let daysInMonth = getDaysInMonth(currentYear, currentMonth);

  // 1) 週末休みチェック
  staffList.forEach(s=>{
    let weekendOffCount=0;
    for (let d=1; d<=daysInMonth; d++){
      if (isWeekend(currentYear, currentMonth, d)) {
        if (!generatedShift[d]?.includes(s.id)) {
          weekendOffCount++;
        }
      }
    }
    if (weekendOffCount<2) {
      messages.push(`【${s.name}】は週末休みが${weekendOffCount}日しかありません`);
      // 軽い提案
      messages.push(`→ 改善案: 土日勤務のうち1日を休みに変更すると良いかも`);
    }
  });

  // 2) 人数チェック
  // ここでは「出勤人数が dailyRequiredStaff[day] とピッタリ一致しているか」を判定
  for (let d=1; d<=daysInMonth; d++){
    const needed = dailyRequiredStaff[d] ?? requiredStaff;
    const assignedCount = generatedShift[d]?.length ?? 0;
    if (assignedCount < needed) {
      messages.push(`${d}日: 必要人数${needed}に対して出勤${assignedCount}で不足`);
      messages.push(`→ 改善案: 休みのスタッフを誰か出勤に変えてみて`);
    } else if (assignedCount > needed) {
      messages.push(`${d}日: 必要人数${needed}に対して出勤${assignedCount}で過剰`);
      messages.push(`→ 改善案: 誰かを休みに切り替えてコストを下げるといいかも`);
    }
  }

  return messages;
}

/*******************************************
 * render
 *******************************************/
function render() {
  const container = document.getElementById("shift-scheduler");
  if (!container) return;
  container.innerHTML="";

  const wrapper = document.createElement("div");
  wrapper.className = "scheduler-container";

  // タイトル
  const titleEl = document.createElement("h1");
  titleEl.className = "scheduler-title";
  titleEl.textContent = "高度版シフトスケジューラー (均等割り, 4連勤抑制, 土日休み考慮, ロック機能)";
  wrapper.appendChild(titleEl);

  /********************************
   * 基本設定
   ********************************/
  const basicSection = document.createElement("div");
  basicSection.className="section mb-8";

  const basicTitle = document.createElement("h2");
  basicTitle.className="section-title";
  basicTitle.textContent="基本設定";
  basicSection.appendChild(basicTitle);

  const navRow=document.createElement("div");
  navRow.className="flex mb-4";

  const leftDiv=document.createElement("div");
  leftDiv.className="flex mr-4";

  const prevBtn=document.createElement("button");
  prevBtn.className="icon-button mr-2";
  prevBtn.innerHTML=chevronLeftIconSVG(20);
  prevBtn.addEventListener("click", goToPreviousMonth);
  leftDiv.appendChild(prevBtn);

  const ymSpan=document.createElement("span");
  ymSpan.className="text-lg font-medium";
  ymSpan.textContent=`${currentYear}年 ${currentMonth}月`;
  leftDiv.appendChild(ymSpan);

  const nextBtn=document.createElement("button");
  nextBtn.className="icon-button ml-2";
  nextBtn.innerHTML=chevronRightIconSVG(20);
  nextBtn.addEventListener("click", goToNextMonth);
  leftDiv.appendChild(nextBtn);

  navRow.appendChild(leftDiv);

  // 右ブロック(基本人数 + リセット)
  const rightDiv=document.createElement("div");
  rightDiv.className="flex";

  const labelStaff=document.createElement("label");
  labelStaff.className="mr-2 font-medium";
  labelStaff.textContent="基本必要スタッフ数:";
  rightDiv.appendChild(labelStaff);

  const staffInput=document.createElement("input");
  staffInput.type="number";
  staffInput.min="1";
  staffInput.value=requiredStaff;
  staffInput.className="input-text mr-4";
  staffInput.addEventListener("change", onChangeRequiredStaff);
  rightDiv.appendChild(staffInput);

  // リセットボタン
  const resetBtn=document.createElement("button");
  resetBtn.className="button";
  resetBtn.textContent="リセット";
  resetBtn.addEventListener("click", resetAllData);
  rightDiv.appendChild(resetBtn);

  navRow.appendChild(rightDiv);

  basicSection.appendChild(navRow);

  // 日別人数
  const dayReqTitle=document.createElement("h3");
  dayReqTitle.className="font-medium mb-2";
  dayReqTitle.textContent="日別必要スタッフ数の設定";
  basicSection.appendChild(dayReqTitle);

  const daysGrid=document.createElement("div");
  daysGrid.className="grid-7";
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  for (let d=1; d<=daysInMonth; d++){
    const dayDiv=document.createElement("div");
    dayDiv.className="text-center mb-2";

    const dow=getDayOfWeek(currentYear, currentMonth, d);
    const label=document.createElement("div");
    label.className = "mb-1 font-medium " + 
      (dow==="土" ? "text-saturday" : dow==="日" ? "text-sunday" : "");
    label.textContent = `${d}(${dow})`;
    dayDiv.appendChild(label);

    const input = document.createElement("input");
    input.type="number";
    input.min="0";
    input.value=dailyRequiredStaff[d] ?? requiredStaff;
    input.className="input-text";
    input.addEventListener("change",(e)=>onChangeDailyStaffRequirement(d,e));
    dayDiv.appendChild(input);

    daysGrid.appendChild(dayDiv);
  }

  basicSection.appendChild(daysGrid);
  wrapper.appendChild(basicSection);

  /********************************
   * スタッフ設定
   ********************************/
  const staffSection=document.createElement("div");
  staffSection.className="mb-8";

  const staffHeader=document.createElement("div");
  staffHeader.className="flex-between mb-4";

  const staffTitle=document.createElement("h2");
  staffTitle.className="section-title mb-0";
  staffTitle.textContent="スタッフ設定";
  staffHeader.appendChild(staffTitle);

  const addStaffBtn=document.createElement("button");
  addStaffBtn.className="button";
  addStaffBtn.innerHTML=plusIconSVG(16)+"スタッフ追加";
  addStaffBtn.addEventListener("click", addStaff);
  staffHeader.appendChild(addStaffBtn);

  staffSection.appendChild(staffHeader);

  staffList.forEach(s=>{
    const staffCard=document.createElement("div");
    staffCard.className="section mb-4";

    const topDiv=document.createElement("div");
    topDiv.className="flex-between mb-2";

    const leftBox=document.createElement("div");
    leftBox.className="flex";

    const nameInput=document.createElement("input");
    nameInput.type="text";
    nameInput.value=s.name;
    nameInput.className="input-text mr-4";
    nameInput.style.width="auto";
    nameInput.addEventListener("change",(e)=>{
      updateStaffInfo(s.id, "name", e.target.value);
    });
    leftBox.appendChild(nameInput);

    const reqOffLabel=document.createElement("label");
    reqOffLabel.className="mr-2 font-medium";
    reqOffLabel.textContent="必要休日数:";
    leftBox.appendChild(reqOffLabel);

    const reqOffInput=document.createElement("input");
    reqOffInput.type="number";
    reqOffInput.min="0";
    reqOffInput.max=daysInMonth;
    reqOffInput.value=s.requiredDaysOff;
    reqOffInput.className="input-text";
    reqOffInput.addEventListener("change",(e)=>{
      updateStaffInfo(s.id, "requiredDaysOff", parseInt(e.target.value)||0);
    });
    leftBox.appendChild(reqOffInput);

    topDiv.appendChild(leftBox);

    const delBtn=document.createElement("button");
    delBtn.className="icon-button";
    delBtn.innerHTML=trashIconSVG(18);
    delBtn.addEventListener("click",()=>removeStaff(s.id));
    topDiv.appendChild(delBtn);

    staffCard.appendChild(topDiv);

    // ラベル(絶対休/希望休/必須出勤)
    const labelRow=document.createElement("div");
    labelRow.className="flex mb-2 text-sm";
    labelRow.innerHTML=`
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
    const dateGrid=document.createElement("div");
    dateGrid.className="grid-7";

    for(let d=1; d<=daysInMonth; d++){
      const cell=document.createElement("div");
      cell.className="text-center";

      const dw=getDayOfWeek(currentYear, currentMonth, d);
      const cellDayLabel=document.createElement("div");
      cellDayLabel.className="mb-1 text-sm " + 
        (dw==="土" ? "text-saturday" : dw==="日" ? "text-sunday" : "");
      cellDayLabel.textContent=d;
      cell.appendChild(cellDayLabel);

      const btnBox=document.createElement("div");
      btnBox.style.display="flex";
      btnBox.style.flexDirection="column";
      btnBox.style.gap="4px";

      // 絶対休
      const absBtn=document.createElement("button");
      absBtn.className="circle-button "+ 
        (s.absoluteDaysOff.includes(`${currentYear}-${currentMonth}-${d}`) ? "bg-absolute-off" : "");
      absBtn.title="絶対休み";
      absBtn.addEventListener("click",()=>toggleDate(s.id,d,"absolute"));
      btnBox.appendChild(absBtn);

      // 希望休
      const reqBtn=document.createElement("button");
      reqBtn.className="circle-button "+
        (s.requestedDaysOff.includes(`${currentYear}-${currentMonth}-${d}`) ? "bg-requested-off" : "");
      reqBtn.title="希望休";
      reqBtn.addEventListener("click",()=>toggleDate(s.id,d,"requested"));
      btnBox.appendChild(reqBtn);

      // 必ず出勤
      const manBtn=document.createElement("button");
      manBtn.className="circle-button "+
        (s.mandatoryWorkDays.includes(`${currentYear}-${currentMonth}-${d}`) ? "bg-mandatory" : "");
      manBtn.title="必須出勤";
      manBtn.addEventListener("click",()=>toggleDate(s.id,d,"mandatory"));
      btnBox.appendChild(manBtn);

      cell.appendChild(btnBox);
      dateGrid.appendChild(cell);
    }

    staffCard.appendChild(dateGrid);
    staffSection.appendChild(staffCard);
  });

  wrapper.appendChild(staffSection);

  /********************************
   * シフト生成ボタン
   ********************************/
  const genBtnWrap=document.createElement("div");
  genBtnWrap.className="text-center mb-8";

  const genBtn=document.createElement("button");
  genBtn.className="button button-icon";
  genBtn.innerHTML=calendarIconSVG(20)+"シフト表を生成";
  genBtn.addEventListener("click",generateShift);

  genBtnWrap.appendChild(genBtn);
  wrapper.appendChild(genBtnWrap);

  /********************************
   * シフト表
   ********************************/
  if(generatedShift){
    const resultDiv=document.createElement("div");
    resultDiv.className="mb-8";

    const resultTitle=document.createElement("h2");
    resultTitle.className="section-title mb-4";
    resultTitle.textContent="生成されたシフト表 (クリックで出勤⇔休み, 日付クリックでロック)";
    resultDiv.appendChild(resultTitle);

    const tableContainer=document.createElement("div");
    tableContainer.className="table-container";

    const table=document.createElement("table");
    table.className="table";

    // thead
    const thead=document.createElement("thead");
    const thRow=document.createElement("tr");

    const thDate=document.createElement("th");
    thDate.textContent="日付 (ロック)";
    thRow.appendChild(thDate);

    staffList.forEach(s=>{
      const th=document.createElement("th");
      th.textContent=s.name;
      thRow.appendChild(th);
    });

    const thCount=document.createElement("th");
    thCount.textContent="出勤人数";
    thRow.appendChild(thCount);

    const thNeeded=document.createElement("th");
    thNeeded.textContent="必要人数";
    thRow.appendChild(thNeeded);

    thead.appendChild(thRow);
    table.appendChild(thead);

    // tbody
    const tbody=document.createElement("tbody");
    for(let d=1; d<=daysInMonth; d++){
      const row=document.createElement("tr");
      // ロックされてたら行をグレーに
      if(lockedDays.has(d)) {
        row.classList.add("locked-row");
      }

      // 日付セル
      const dateCell=document.createElement("td");
      dateCell.className="font-medium";
      dateCell.textContent=`${d}日(${getDayOfWeek(currentYear, currentMonth, d)})`;
      // 日付セル自体をクリックでロックON/OFF
      dateCell.style.cursor="pointer";
      dateCell.addEventListener("click", ()=>toggleLockDay(d));
      row.appendChild(dateCell);

      // 各スタッフ
      const assignedIds = generatedShift[d] || [];
      const needed = dailyRequiredStaff[d] ?? requiredStaff;

      staffList.forEach(s=>{
        const cell=document.createElement("td");
        // ロックされてたらcursorなしにする
        cell.style.cursor = lockedDays.has(d) ? "default" : "pointer";

        const isWorking=assignedIds.includes(s.id);
        const dateStr = `${currentYear}-${currentMonth}-${d}`;
        if(isWorking){
          cell.textContent="出勤";
          cell.className="working-cell";
          if(s.mandatoryWorkDays.includes(dateStr)) {
            cell.classList.add("working-mandatory");
          }
        } else {
          cell.textContent="休み";
          cell.className="rest-cell";
          if(s.absoluteDaysOff.includes(dateStr)) {
            cell.classList.add("rest-absolute");
          } else if(s.requestedDaysOff.includes(dateStr)) {
            cell.classList.add("rest-requested");
          }
        }
        // 4連勤2回以上ハイライト
        const highlightSet = highlightDaysForStaff[s.id]||new Set();
        if(highlightSet.has(d)) {
          cell.classList.add("purple-highlight");
        }

        if(!lockedDays.has(d)){
          cell.addEventListener("click", ()=>toggleShiftCell(s.id,d));
        }
        row.appendChild(cell);
      });

      // 出勤人数
      const countCell=document.createElement("td");
      countCell.textContent=assignedIds.length;
      if(assignedIds.length<needed){
        countCell.className="needed-attention";
      }
      row.appendChild(countCell);

      // 必要人数
      const neededCell=document.createElement("td");
      neededCell.textContent=needed;
      row.appendChild(neededCell);

      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    resultDiv.appendChild(tableContainer);

    // 休日数サマリ
    const summaryTitle=document.createElement("h3");
    summaryTitle.className="font-medium mb-2 mt-6";
    summaryTitle.textContent="休日数サマリー";
    resultDiv.appendChild(summaryTitle);

    const summaryTable=document.createElement("table");
    summaryTable.className="table summary-table";

    const sThead=document.createElement("thead");
    const sHeadRow=document.createElement("tr");
    ["スタッフ","必要休日数","実際の休日数","希望休の達成率"].forEach(txt=>{
      const th=document.createElement("th");
      th.textContent=txt;
      sHeadRow.appendChild(th);
    });
    sThead.appendChild(sHeadRow);
    summaryTable.appendChild(sThead);

    const sTbody=document.createElement("tbody");
    staffList.forEach(st=>{
      const tr=document.createElement("tr");

      const tdName=document.createElement("td");
      tdName.textContent=st.name;
      tr.appendChild(tdName);

      const tdReqOff=document.createElement("td");
      tdReqOff.textContent=st.requiredDaysOff;
      tr.appendChild(tdReqOff);

      // 実際の休日数
      const totalDays=daysInMonth;
      let workCount=0;
      for(let d=1; d<=totalDays; d++){
        if(generatedShift[d]?.includes(st.id)) workCount++;
      }
      const actualOff=totalDays - workCount;

      const tdOff=document.createElement("td");
      tdOff.textContent=actualOff;
      if(actualOff<st.requiredDaysOff) {
        tdOff.classList.add("too-few-off");
      }
      tr.appendChild(tdOff);

      // 希望休達成率
      const requestedOffDays = st.requestedDaysOff.filter(ds=>{
        const [y,m,dd] = ds.split("-").map(Number);
        return (y===currentYear && m===currentMonth && dd<=totalDays);
      });
      const requestedNums = requestedOffDays.map(ds=>parseInt(ds.split("-")[2]));
      const achievedReq = requestedNums.filter(dd=>!generatedShift[dd]?.includes(st.id));
      const rate = (requestedNums.length>0)
        ? Math.round(achievedReq.length/requestedNums.length*100)
        : 100;

      const tdRate=document.createElement("td");
      tdRate.textContent=`${rate}% (${achievedReq.length}/${requestedNums.length})`;
      tr.appendChild(tdRate);

      sTbody.appendChild(tr);
    });
    summaryTable.appendChild(sTbody);

    resultDiv.appendChild(summaryTable);

    wrapper.appendChild(resultDiv);

    /********************************
     * 追加: チェック結果・提案表示
     ********************************/
    const messageDiv=document.createElement("div");
    messageDiv.className="message-area";

    const msgs=checkAndSuggestImprovements();
    if(msgs.length===0){
      // 全部OKの場合(特に不足なし)
      const okMsg=document.createElement("h3");
      okMsg.className="message-success";
      okMsg.textContent="全ての条件を満たしています！";
      messageDiv.appendChild(okMsg);
    } else {
      const warnMsg=document.createElement("h3");
      warnMsg.className="message-error";
      warnMsg.textContent="いくつか改善の余地があります:";
      messageDiv.appendChild(warnMsg);

      msgs.forEach(m=>{
        const p=document.createElement("p");
        if(m.includes("→ 改善案:")) {
          p.className="message-hint";
        }
        p.textContent=m;
        messageDiv.appendChild(p);
      });
    }

    wrapper.appendChild(messageDiv);
  }

  container.appendChild(wrapper);
  // state保存
  saveStateToLocalStorage();
}

/**********************************************
 * チェック&提案
 **********************************************/
function checkAndSuggestImprovements(){
  let msgs=[];
  if(!generatedShift) return msgs;

  const daysInMonth=getDaysInMonth(currentYear, currentMonth);

  // (1) 土日休みが2日以上か?
  staffList.forEach(s=>{
    let weekendOff=0;
    for(let d=1; d<=daysInMonth; d++){
      if(isWeekend(currentYear,currentMonth,d)){
        if(!generatedShift[d]?.includes(s.id)) {
          weekendOff++;
        }
      }
    }
    if(weekendOff<2){
      msgs.push(`【${s.name}】は週末休みが${weekendOff}日しかありません`);
      msgs.push(`→ 改善案: 土日勤務日のうち1日を休みに切り替えてみては？`);
    }
  });

  // (2) 各日の人数がちょうど合ってるか
  // もし "最低限" でOKなら <= の比較にする
  for(let d=1; d<=daysInMonth; d++){
    const needed = dailyRequiredStaff[d] ?? requiredStaff;
    const assignedCount=generatedShift[d]?.length || 0;
    if(assignedCount<needed){
      msgs.push(`${d}日: 必要人数${needed}に対して出勤${assignedCount}で不足`);
      msgs.push(`→ 改善案: 他の日で余裕のあるスタッフをこの日に移す`);
    } else if(assignedCount>needed){
      msgs.push(`${d}日: 必要人数${needed}に対して出勤${assignedCount}で過剰`);
      msgs.push(`→ 改善案: コスト削減のため1人を休みにしてもいいかも`);
    }
  }

  return msgs;
}

/**********************************************
 * アイコン
 **********************************************/
function chevronLeftIconSVG(size=24){
  return `
<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24">
  <polyline points="15 18 9 12 15 6"></polyline>
</svg>`;
}
function chevronRightIconSVG(size=24){
  return `
<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24">
  <polyline points="9 18 15 12 9 6"></polyline>
</svg>`;
}
function plusIconSVG(size=24){
  return `
<svg class="svg-icon mr-1" width="${size}" height="${size}" viewBox="0 0 24 24">
  <line x1="12" y1="5" x2="12" y2="19"></line>
  <line x1="5" y1="12" x2="19" y2="12"></line>
</svg>`;
}
function trashIconSVG(size=24){
  return `
<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24">
  <polyline points="3 6 5 6 21 6"></polyline>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8
           a2 2 0 0 1-2-2L5 6"></path>
  <line x1="10" y1="11" x2="10" y2="17"></line>
  <line x1="14" y1="11" x2="14" y2="17"></line>
</svg>`;
}
function calendarIconSVG(size=24){
  return `
<svg class="svg-icon mr-2" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
  <line x1="16" y1="2" x2="16" y2="6"></line>
  <line x1="8" y1="2" x2="8" y2="6"></line>
  <line x1="3" y1="10" x2="21" y2="10"></line>
</svg>`;
}

/**********************************************
 * 初期
 **********************************************/
document.addEventListener("DOMContentLoaded", () => {
  loadStateFromLocalStorage();
  render();
});
