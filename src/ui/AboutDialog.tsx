import React from 'react';
import {Modal} from './Modal';
import packageInfo from '../../package.json';
import {larryVisionLogo,aboutLogo,artworkNotice} from '@larryvision-branding';

export {larryVisionLogo,aboutLogo};
/** The logo row and the notices sit in one padded body; Close is a bordered dialog footer button. */
export function AboutDialog({onClose}:{onClose:()=>void}){
 return <Modal title="About OpenCandle" onClose={onClose}>
  <div className="about-larryvision-body">
   <section className="about-larryvision">
    <img className="about-larryvision-logo" src={aboutLogo} alt="OpenCandle logo" width="144" height="144"/>
    <div><h3>OpenCandle</h3><p>Version {packageInfo.version}</p><p>Local charts, analysis and virtual paper trading.</p></div>
   </section>
   <p className="about-larryvision-notice">OpenCandle is free and source-available under the PolyForm Noncommercial License 1.0.0, with extra permission for your own trading and internal business use. It may not be sold. Third-party notices are included with the desktop app.</p>
   <p className="about-larryvision-notice">Provided as is, without warranty. Not financial advice. Paper trading is simulated with virtual money.</p>
   <p className="about-larryvision-notice">{artworkNotice}</p>
  </div>
  <footer className="about-larryvision-actions"><span/><button type="button" onClick={onClose}>Close</button></footer>
 </Modal>;
}
