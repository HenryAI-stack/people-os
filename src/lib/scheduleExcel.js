import { CENTERS, getCenter } from './scheduleGenerator.js'
import { getDaysInMonth, getHoliday } from './holidays.js'

// Fills mirror the app's own on-screen colors (--accent for an on-shift chip,
// --warn/--bad tints for weekend/holiday cells in styles.css) rather than the
// arbitrary palette in the reference sheet this was modeled on.
const FILL_SHIFT   = 'FFF3D9BE' // light --accent tint — on shift this day
const FILL_HOLIDAY = 'FFF3C7C2' // light --bad tint — public holiday, not on shift
const FILL_DAYOFF  = 'FFEDEFF2' // neutral — day off, not on shift
const HEADER_FILL  = 'FF497A7C'
const TITLE_COLOR  = 'FF1F2937'

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function thinBorder(color = 'FFFFFFFF') {
  const side = { style: 'thin', color: { argb: color } }
  return { top: side, bottom: side, left: side, right: side }
}

/**
 * One [code, fill] per person per day:
 * - 'S' (on shift) when they have a non-cleared assignment that date/center
 * - 'H' (holiday) when it's a public holiday for that center's country and
 *   they aren't on shift
 * - 'D' (day off) otherwise — including weekends and cleared assignments
 */
function dayCode(dateStr, center, personId, assignmentMap) {
  const onShift = (assignmentMap[`${dateStr}|${center.id}`] || [])
    .some((a) => a.personId === personId && !a.cleared)
  if (onShift) return ['S', FILL_SHIFT]
  if (getHoliday(dateStr, center.country)) return ['H', FILL_HOLIDAY]
  return ['D', FILL_DAYOFF]
}

function addLegend(sheet, row, hours) {
  const items = [
    ['S', FILL_SHIFT,   `Shift ${hours}`],
    ['D', FILL_DAYOFF,  'Day Off'],
    ['H', FILL_HOLIDAY, 'Holiday'],
  ]
  let col = 2 // B
  for (const [code, argb, label] of items) {
    const codeCell = sheet.getCell(row, col)
    codeCell.value = code
    codeCell.font = { bold: true, size: 12 }
    codeCell.fill = fill(argb)
    codeCell.alignment = { horizontal: 'center', vertical: 'center' }
    const labelStart = col + 1
    const labelEnd = col + 3
    sheet.mergeCells(row, labelStart, row, labelEnd)
    const labelCell = sheet.getCell(row, labelStart)
    labelCell.value = label
    labelCell.alignment = { vertical: 'center' }
    col = labelEnd + 2 // one gap column between legend items
  }
}

function buildCenterSheet(workbook, center, people, month, schedule) {
  const days = getDaysInMonth(month)
  const sheet = workbook.addWorksheet(center.id, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 7 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })

  const assignmentMap = {}
  for (const a of schedule?.assignments || []) {
    const key = `${a.date}|${a.center}`
    if (!assignmentMap[key]) assignmentMap[key] = []
    assignmentMap[key].push(a)
  }

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Row 1 — title, merged across every day column (A..last day column)
  const lastCol = 1 + days.length
  sheet.mergeCells(1, 1, 1, lastCol)
  const title = sheet.getCell(1, 1)
  title.value = `${center.label} | ${monthLabel} | Shift ${center.hours}`
  title.font = { bold: true, size: 16, color: { argb: TITLE_COLOR } }
  title.alignment = { horizontal: 'left' }
  sheet.getRow(1).height = 26

  // Row 3 — legend
  addLegend(sheet, 3, center.hours)
  sheet.getRow(3).height = 24

  // Row 6 — weekday abbreviations, Row 7 — "Employee name" + real dates (d-mmm)
  const weekdayRow = sheet.getRow(6)
  const dateRow = sheet.getRow(7)
  dateRow.getCell(1).value = 'Employee name'
  dateRow.getCell(1).font = { bold: true }
  dateRow.getCell(1).alignment = { vertical: 'center' }

  days.forEach((dateStr, i) => {
    const col = i + 2
    const d = new Date(dateStr)
    const wd = weekdayRow.getCell(col)
    wd.value = d.toLocaleDateString('en-GB', { weekday: 'short' })
    wd.font = { bold: true, size: 10 }
    wd.alignment = { horizontal: 'center' }

    const dc = dateRow.getCell(col)
    dc.value = d // real date, not a string — number format renders it as "1-Oct"
    dc.numFmt = 'd-mmm'
    dc.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    dc.fill = fill(HEADER_FILL)
    dc.alignment = { horizontal: 'center', vertical: 'center' }
  })
  weekdayRow.height = 18
  dateRow.height = 22

  // Rows 8+ — one per person
  people.forEach((person, i) => {
    const row = sheet.getRow(8 + i)
    row.height = 22
    const nameCell = row.getCell(1)
    nameCell.value = person.name
    nameCell.font = { bold: true }
    nameCell.alignment = { horizontal: 'left', vertical: 'center', indent: 1 }

    days.forEach((dateStr, di) => {
      const [code, argb] = dayCode(dateStr, center, person.id, assignmentMap)
      const cell = row.getCell(di + 2)
      cell.value = code
      cell.fill = fill(argb)
      cell.alignment = { horizontal: 'center', vertical: 'center' }
      cell.border = thinBorder()
      cell.font = { bold: true }
    })
  })

  sheet.getColumn(1).width = 25
  for (let i = 2; i <= lastCol; i++) sheet.getColumn(i).width = 5.5

  const footerRow = 9 + people.length
  const footer = sheet.getCell(footerRow, 1)
  sheet.mergeCells(footerRow, 1, footerRow, lastCol)
  footer.value = `Generated by PeopleOS on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  footer.font = { italic: true, size: 9, color: { argb: 'FF666666' } }
}

/** Builds and downloads the monthly schedule as a multi-sheet .xlsx — one sheet
 * per support center, styled to match the app's on-screen shift/day-off/holiday
 * colors, with a legend, weekday+date header row, and one row per person.
 * exceljs (~270KB gzipped) is dynamically imported here rather than at the top
 * of the file, so it's only ever downloaded when someone actually exports —
 * not added to every page's bundle. */
export async function downloadScheduleExcel(month, people, schedule) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PeopleOS'
  workbook.created = new Date()

  for (const center of CENTERS) {
    const centerPeople = people.filter((p) => getCenter(p) === center.id)
    if (!centerPeople.length) continue
    buildCenterSheet(workbook, center, centerPeople, month, schedule)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `work-schedule-${month}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
