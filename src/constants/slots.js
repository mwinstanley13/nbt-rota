// Slot definitions — wd=weekday only, we=weekend only, both=true/true
export const SLOTS = [
  {key:"E1", grp:"EARLY",    wd:true, we:false,label:"Early 1",    hdr:"ST EARLY",    bg:"#dcfce7",fg:"#14532d",bd:"#86efac"},
  {key:"E2", grp:"EARLY",    wd:true, we:false,label:"Early 2",    hdr:"",            bg:"#dcfce7",fg:"#14532d",bd:"#86efac"},
  {key:"E3", grp:"EARLY",    wd:true, we:false,label:"Early 3",    hdr:"",            bg:"#dcfce7",fg:"#14532d",bd:"#86efac"},
  {key:"E4", grp:"EARLY",    wd:true, we:false,label:"Early 4",    hdr:"",            bg:"#dcfce7",fg:"#14532d",bd:"#86efac"},
  {key:"M1", grp:"MID",      wd:true, we:false,label:"Mid 1",      hdr:"ST MID",      bg:"#dbeafe",fg:"#1e3a8a",bd:"#93c5fd"},
  {key:"M2", grp:"MID",      wd:true, we:false,label:"Mid 2",      hdr:"",            bg:"#dbeafe",fg:"#1e3a8a",bd:"#93c5fd"},
  {key:"M3", grp:"MID",      wd:true, we:false,label:"Mid 3",      hdr:"",            bg:"#dbeafe",fg:"#1e3a8a",bd:"#93c5fd"},
  {key:"L1", grp:"LATE",     wd:true, we:false,label:"Late 1",     hdr:"ST LATE",     bg:"#fef3c7",fg:"#78350f",bd:"#fcd34d"},
  {key:"L2", grp:"LATE",     wd:true, we:false,label:"Late 2",     hdr:"",            bg:"#fef3c7",fg:"#78350f",bd:"#fcd34d"},
  {key:"L3", grp:"LATE",     wd:true, we:false,label:"Late 3",     hdr:"",            bg:"#fef3c7",fg:"#78350f",bd:"#fcd34d"},
  {key:"L4", grp:"LATE",     wd:true, we:false,label:"Late 4",     hdr:"",            bg:"#fef3c7",fg:"#78350f",bd:"#fcd34d"},
  {key:"WE1",grp:"WE_EARLY", wd:false,we:true, label:"W/E Early 1",hdr:"ST W/E EARLY",bg:"#f3e8ff",fg:"#581c87",bd:"#d8b4fe"},
  {key:"WE2",grp:"WE_EARLY", wd:false,we:true, label:"W/E Early 2",hdr:"",            bg:"#f3e8ff",fg:"#581c87",bd:"#d8b4fe"},
  {key:"WE3",grp:"WE_EARLY", wd:false,we:true, label:"W/E Early 3",hdr:"",            bg:"#f3e8ff",fg:"#581c87",bd:"#d8b4fe"},
  {key:"WL1",grp:"WE_LATE",  wd:false,we:true, label:"W/E Late 1", hdr:"ST W/E LATE", bg:"#fce7f3",fg:"#831843",bd:"#f9a8d4"},
  {key:"WL2",grp:"WE_LATE",  wd:false,we:true, label:"W/E Late 2", hdr:"",            bg:"#fce7f3",fg:"#831843",bd:"#f9a8d4"},
  {key:"N1", grp:"NIGHT1",   wd:true, we:true, label:"SDM Night 1", hdr:"SDM 1 NIGHT", bg:"#1e1b4b",fg:"#c7d2fe",bd:"#6366f1"},
  {key:"N2", grp:"NIGHT2",   wd:true, we:true, label:"SDM Night 2", hdr:"SDM 2 NIGHT", bg:"#312e81",fg:"#e0e7ff",bd:"#818cf8"},
  {key:"SN", grp:"ST3_NIGHT",wd:true, we:true, label:"ST3 Night",   hdr:"ST3 NIGHT",   bg:"#0c4a6e",fg:"#bae6fd",bd:"#38bdf8"},
  {key:"AN", grp:"ACP_NIGHT",wd:true, we:true, label:"ACP Night",   hdr:"ACP NIGHT",   bg:"#064e3b",fg:"#6ee7b7",bd:"#34d399"},
];

// Hours per shift by slot key — doc = ST4+/ST3, acp = ACP/tACP
export const SLOT_HOURS = {
  E1:{doc:8.5,acp:10}, E2:{doc:8.5,acp:10}, E3:{doc:8.5,acp:10}, E4:{doc:8.5,acp:10},
  M1:{doc:9,  acp:10}, M2:{doc:9,  acp:10}, M3:{doc:9,  acp:10},
  L1:{doc:8,  acp:10}, L2:{doc:8,  acp:10}, L3:{doc:8,  acp:10}, L4:{doc:8,  acp:10},
  WE1:{doc:10,acp:10}, WE2:{doc:10,acp:10}, WE3:{doc:10,acp:10},
  WL1:{doc:10.5,acp:10.5}, WL2:{doc:10.5,acp:10.5},
  N1:{doc:10.5,acp:10.5},  N2:{doc:10.5,acp:10.5},
  SN:{doc:10.5,acp:10.5},  AN:{doc:10.5,acp:10.5},
};

export const NIGHT_SLOTS  = new Set(["N1","N2","SN","AN"]);
export const WE_SLOTS     = new Set(["WE1","WE2","WE3","WL1","WL2"]);
export const EARLY_SLOTS  = new Set(["E1","E2","E3","E4"]);
export const MID_SLOTS    = new Set(["M1","M2","M3"]);
export const LATE_SLOTS   = new Set(["L1","L2","L3","L4"]);
