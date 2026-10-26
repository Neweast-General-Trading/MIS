import * as XLSX from 'xlsx';
import type { HqAccessEvent, PresenceDay } from './types';

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function exportAttendance(events: HqAccessEvent[], days: PresenceDay[]) {
  const wb = XLSX.utils.book_new();
  const punches = events.map((e) => ({
    Date: e.accessDate,
    Time: e.accessTime,
    Weekday: e.weekday,
    EmployeeID: e.employeeId,
    Name: e.name,
    Department: e.department,
    JobTitle: e.jobTitle,
    Building: e.building,
    Floor: e.floor,
    Device: e.deviceName,
    Direction: e.direction,
    Auth: e.authResult,
  }));
  const presence = days.map((d) => ({
    Date: d.date,
    EmployeeID: d.employeeId,
    Name: d.name,
    Department: d.department,
    FirstPunch: d.first,
    LastPunch: d.last,
    Punches: d.punches,
    HoursOnSite: Number(d.hours.toFixed(2)),
    Late: d.late ? 'Yes' : '',
    EarlyOut: d.earlyOut ? 'Yes' : '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(punches.length ? punches : [{ Note: 'No rows' }]), 'Punches');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(presence.length ? presence : [{ Note: 'No rows' }]), 'Daily presence');
  XLSX.writeFile(wb, `NEWEAST-HQ-Attendance-${stamp()}.xlsx`);
}
