import React, { useState } from 'react'

function RotaRulesView({rotaRulesText,setRotaRulesText,addAudit,currentUser,isAdmin}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(rotaRulesText||"");

  const save=()=>{
    setRotaRulesText(draft);
    addAudit(currentUser.init,"Rota Rules","Rota rules text updated");
    setEditing(false);
  };
  const cancel=()=>{setDraft(rotaRulesText||"");setEditing(false);};

  // Render plain text with line-breaks preserved
  const renderText=txt=>{
    if(!txt||!txt.trim()) return <p style={{color:"#94a3b8",fontStyle:"italic",margin:0}}>No rota rules have been published yet.</p>;
    return txt.split("\n").map((line,i)=>{
      // Render lines starting with # as headings
      if(line.startsWith("### ")) return <h4 key={i} style={{margin:"18px 0 6px",fontSize:14,fontWeight:700,color:"#1e293b"}}>{line.slice(4)}</h4>;
      if(line.startsWith("## "))  return <h3 key={i} style={{margin:"22px 0 8px",fontSize:16,fontWeight:700,color:"#0f172a",borderBottom:"1px solid #e2e8f0",paddingBottom:6}}>{line.slice(3)}</h3>;
      if(line.startsWith("# "))   return <h2 key={i} style={{margin:"24px 0 10px",fontSize:19,fontWeight:800,color:"#0f172a"}}>{line.slice(2)}</h2>;
      if(line.startsWith("- ")||line.startsWith("• ")) return <div key={i} style={{display:"flex",gap:8,padding:"2px 0",fontSize:13.5,color:"#374151"}}><span style={{color:"#6366f1",flexShrink:0,marginTop:2}}>•</span><span>{line.slice(2)}</span></div>;
      if(line.trim()==="") return <div key={i} style={{height:10}}/>;
      return <p key={i} style={{margin:"4px 0",fontSize:13.5,color:"#374151",lineHeight:1.65}}>{line}</p>;
    });
  };

  return (
    <div style={{maxWidth:800}}>
      <div className="card">
        <div className="ch" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span className="ct">📜 Rota Rules</span>
          {isAdmin&&!editing&&<button className="btn bp bsm" onClick={()=>{setDraft(rotaRulesText||"");setEditing(true);}}>✏️ Edit</button>}
        </div>
        <div className="cb">
          {isAdmin&&editing?(
            <>
              <div className="al al-i" style={{marginBottom:12,fontSize:12.5}}>
                Use <strong># Heading</strong>, <strong>## Section</strong>, <strong>### Sub-section</strong> for headings. Use <strong>- item</strong> for bullet points. Blank lines create spacing.
              </div>
              <textarea
                value={draft}
                onChange={e=>setDraft(e.target.value)}
                rows={20}
                style={{width:"100%",fontFamily:"'DM Sans',sans-serif",fontSize:13.5,lineHeight:1.6,padding:"12px 14px",border:"1px solid #e2e8f0",borderRadius:8,resize:"vertical",color:"#374151",background:"#f8fafc",boxSizing:"border-box"}}
                placeholder={"# Rota Rules 2026/27\n\n## Overview\nWrite an overview of how the rota works...\n\n## Shift Types\n- Early: 08:00–16:00\n- Mid: 12:00–20:00\n- Late: 14:00–22:00\n\n## Night Blocks\n..."}
              />
              <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
                <button className="btn bs" onClick={cancel}>Cancel</button>
                <button className="btn bp" onClick={save}>Save Rules</button>
              </div>
            </>
          ):(
            <div style={{fontFamily:"'DM Sans',sans-serif",lineHeight:1.65}}>
              {renderText(rotaRulesText||"")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RotaRulesView
