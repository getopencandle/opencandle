import React from 'react';
export class RecoveryBoundary extends React.Component<{children:React.ReactNode},{error:string|null;message:string}>{
 state={error:null as string|null,message:''};
 static getDerivedStateFromError(error:unknown){return{error:error instanceof Error?error.message:String(error)};}
 async exportSaved(){if(!window.lv){this.setState({message:'Recovery export needs the desktop app.'});return;}try{const loaded=await window.lv.loadWorkspace();if(!loaded.ok)throw new Error(loaded.error.message);if(!loaded.value.data)throw new Error('No saved workspace document.');const exported=await window.lv.exportWorkspace({schemaVersion:1,data:loaded.value.data});this.setState({message:exported.ok?'Saved workspace exported.':exported.error.message});}catch(e){this.setState({message:String(e)});}}
 render(){if(!this.state.error)return this.props.children;return <main className="recovery"><h1>OpenCandle needs to recover this workspace</h1><p>The interface stopped after an error. Your saved document has not been replaced by this recovery screen.</p><pre>{this.state.error}</pre><button onClick={()=>window.location.reload()}>Reload</button><button onClick={()=>void this.exportSaved()}>Export saved workspace</button><p role="status">{this.state.message}</p></main>;}
}
