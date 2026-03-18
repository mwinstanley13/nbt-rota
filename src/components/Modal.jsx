import React from 'react'

const Modal = ({title,onClose,children,footer,lg}) => (
  <div className="mbk" onClick={onClose}>
    <div className={`mbox${lg?" mbox-lg":""}`} onClick={e=>e.stopPropagation()}>
      <div className="mh"><span className="mt">{title}</span><button className="mc" onClick={onClose}>×</button></div>
      <div className="mb">{children}</div>
      {footer&&<div className="mf">{footer}</div>}
    </div>
  </div>
);

export default Modal
