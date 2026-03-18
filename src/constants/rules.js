import { SLOTS } from './slots.js';

// Default shift start/end times per slot (admin-editable in Rota Config)
export const DEFAULT_SHIFT_TIMES = {
  E1:{start:"08:00",end:"16:30"}, E2:{start:"08:00",end:"16:30"}, E3:{start:"08:00",end:"16:30"}, E4:{start:"08:00",end:"16:30"},
  M1:{start:"11:00",end:"20:00"}, M2:{start:"11:00",end:"20:00"}, M3:{start:"11:00",end:"20:00"},
  L1:{start:"16:00",end:"00:00"}, L2:{start:"16:00",end:"00:00"}, L3:{start:"16:00",end:"00:00"}, L4:{start:"16:00",end:"00:00"},
  WE1:{start:"08:00",end:"18:00"}, WE2:{start:"08:00",end:"18:00"}, WE3:{start:"08:00",end:"18:00"},
  WL1:{start:"14:00",end:"00:00"}, WL2:{start:"14:00",end:"00:00"},
  N1:{start:"22:00",end:"08:30"}, N2:{start:"22:00",end:"08:30"}, SN:{start:"22:00",end:"08:30"}, AN:{start:"22:00",end:"08:30"},
  SL:{start:"08:00",end:"16:00"}, RESEARCH:{start:"08:00",end:"16:00"}, FELLOW:{start:"08:00",end:"16:00"}, MILITARY:{start:"08:00",end:"16:00"},
};

// Returns shift duration in hours (handles overnight crossings)
export const getShiftDuration = (slotKey, init, shiftTimes, staffShiftTimes) => {
  const times = ((staffShiftTimes||{})[init]||{})[slotKey] || (shiftTimes||{})[slotKey] || DEFAULT_SHIFT_TIMES[slotKey];
  if (!times) return 0;
  const [sh,sm] = times.start.split(":").map(Number);
  const [eh,em] = times.end.split(":").map(Number);
  let hrs = (eh*60+em - (sh*60+sm)) / 60;
  if (hrs <= 0) hrs += 24;
  return hrs;
};

// AI generation rules — default config
export const INIT_GEN_RULES = {
  slotGrades: {
    E1:["ST4+","ST3","ACP","tACP"], E2:["ST4+","ST3","ACP","tACP"], E3:["ST4+","ST3","ACP","tACP"], E4:["ST4+","ST3","ACP","tACP"],
    M1:["ST4+","ST3","ACP","tACP"], M2:["ST4+","ST3","ACP","tACP"], M3:["ST4+","ST3","ACP","tACP"],
    L1:["ST4+","ST3","ACP","tACP"], L2:["ST4+","ST3","ACP","tACP"], L3:["ST4+","ST3","ACP","tACP"], L4:["ST4+","ST3","ACP","tACP"],
    WE1:["ST4+","ST3","ACP","tACP"], WE2:["ST4+","ST3","ACP","tACP"], WE3:["ST4+","ST3","ACP","tACP"],
    WL1:["ST4+","ST3","ACP","tACP"], WL2:["ST4+","ST3","ACP","tACP"],
    N1:["ST4+"], N2:["ST4+"], SN:["ST3"], AN:["ACP","tACP"],
  },
  minStaffing: {
    monday:        ["E1","L1","L2","N1"],
    weekday_other: ["E1","L1","N1"],
    friday:        ["E1","L1","N1"],
    weekend:       ["WE1","WL1","N1"],
  },
  weekdayNightDays: ["Monday","Tuesday","Wednesday","Thursday"],
  weekendNightDays: ["Friday","Saturday","Sunday"],
  maxShiftHours: 13, minRestHours: 11, maxConsecNights: 4, maxConsecLongDays: 5,
  maxConsecWorkingDays: 7, postNightRestHours: 46, restEvery14Days: 48,
  maxWeekendFreq: "1in2", targetWeekendFreq: "1in3", maxConsecWeekends: 4,
  balanceNights: true, balanceWeekends: true, matchWteTargets: true,
};

// Grade keys and shift fields used in RotaConfig
export const GRADE_KEYS = ["ST4+","ST3","ACP","tACP","Military"];
export const SHIFT_FIELDS = [
  {key:"nights",   label:"Nights"},
  {key:"weekends", label:"Weekends"},
  {key:"earlies",  label:"Earlies"},
  {key:"mids",     label:"Mids"},
  {key:"lates",    label:"Lates"},
];

// Built-in system rule definitions (toggleable in Conflicts & Rules view)
export const DEFAULT_SYS_RULES = {
  unavailConflict: {label:"Availability conflict",  desc:"Staff assigned when marked Unavailable, SL, or Military",    enabled:true,  severity:"error"},
  leaveEntryClash: {label:"Leave entry clash",       desc:"Staff assigned when a leave entry exists (not already blocked by availability)",  enabled:false, severity:"warn"},
  gradeMismatch:   {label:"Grade mismatch",          desc:"Staff assigned to a slot their grade is not permitted for",   enabled:true,  severity:"warn"},
  doubleBook:      {label:"Double booking",          desc:"Staff appearing in more than one slot on the same day",       enabled:true,  severity:"error"},
  postNightRest:   {label:"Post-night rest (46 h)",  desc:"Staff assigned within 46 hours of completing a night shift", enabled:false, severity:"warn"},
};
