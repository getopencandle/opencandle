// First import, so every module below sees normal mode (no generated prices outside the example screen).
import './ui/normal-data-mode';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/components.css';
import './ui/overlay.css';
import './ui/analysis.css';
import './ui/news.css';
import {RecoveryBoundary} from './ui/RecoveryBoundary';
import {disposeApplicationVwapClient} from './vwap/application-client';
import {staggerNextChartBuild} from './ui/chart-build-queue';
import {runInSeparateTasks,startupPrewarmSteps} from './ui/startup-prewarm';
import {isWickStripWindow} from './ui/wick-mode';
import {WickStrip} from './ui/WickStrip';
window.addEventListener('unload',disposeApplicationVwapClient,{once:true});
// The Wick mode strip window (?window=wick) draws only the tab strip the main window sends it.
if(isWickStripWindow(window.location.search)){document.documentElement.dataset.lvWick='';createRoot(document.getElementById('root')!).render(<React.StrictMode><WickStrip/></React.StrictMode>);}
else{
// The startup chart builds in a task of its own, after the commit of the restored workspace (see chart-build-queue.ts).
staggerNextChartBuild();
// The demo histories the first render reads are generated first, one symbol per task (see startup-prewarm.ts).
runInSeparateTasks(startupPrewarmSteps(),()=>createRoot(document.getElementById('root')!).render(<React.StrictMode><RecoveryBoundary><App /></RecoveryBoundary></React.StrictMode>));
}
