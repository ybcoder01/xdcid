"use client";

import { useState } from "react";
import { NetworkLogo } from "./NetworkLogo";
import styles from "./BrandDesignLab.module.css";

type Concept = "loom" | "passport" | "spectrum";
type Screen = "home" | "dashboard" | "identity" | "send" | "pay" | "subdomains" | "history" | "build";

const concepts: Array<{ id: Concept; name: string; idea: string }> = [
  { id: "loom", name: "Route Loom", idea: "Ownership woven into five precise routes" },
  { id: "passport", name: "Material Passport", idea: "A living identity record with visible provenance" },
  { id: "spectrum", name: "Proof Spectrum", idea: "One identity expressed through five verified signals" },
];

const screens: Array<{ id: Screen; label: string }> = [
  { id: "home", label: "Home" },
  { id: "dashboard", label: "Dashboard" },
  { id: "identity", label: "Identity" },
  { id: "send", label: "Send" },
  { id: "pay", label: "Pay links" },
  { id: "subdomains", label: "Subdomains" },
  { id: "history", label: "History" },
  { id: "build", label: "Developers" },
];

const routes = [
  { chainId: 50, name: "XDC", address: "0xe82a…e06A", state: "Owner address" },
  { chainId: 1, name: "Ethereum", address: "0x031d…994f", state: "Custom route" },
  { chainId: 8453, name: "Base", address: "0x8b71…2d30", state: "Custom route" },
  { chainId: 42161, name: "Arbitrum", address: "0x5c22…91bf", state: "Custom route" },
  { chainId: 137, name: "Polygon", address: "0xa920…8c11", state: "Custom route" },
] as const;

export function BrandDesignLab() {
  const [concept, setConcept] = useState<Concept>("loom");
  const [screen, setScreen] = useState<Screen>("home");
  const activeConcept = concepts.find((item) => item.id === concept) ?? concepts[0];

  return (
    <main className={styles.lab}>
      <section className={styles.controls} aria-label="Design review controls">
        <div>
          <span className={styles.labEyebrow}>XDCID / PRODUCT IDENTITY LAB</span>
          <strong>{activeConcept.name}</strong>
          <span>{activeConcept.idea}</span>
        </div>
        <div className={styles.switchers}>
          <div className={styles.segmented} aria-label="Creative direction">
            {concepts.map((item, index) => (
              <button aria-pressed={concept === item.id} key={item.id} onClick={() => setConcept(item.id)} type="button">
                <span>0{index + 1}</span>{item.name}
              </button>
            ))}
          </div>
          <div className={styles.screenTabs} aria-label="Product screen">
            {screens.map((item) => (
              <button aria-pressed={screen === item.id} key={item.id} onClick={() => setScreen(item.id)} type="button">
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.stage} data-concept={concept}>
        {concept === "loom" ? <LoomScreen screen={screen} /> : null}
        {concept === "passport" ? <PassportScreen screen={screen} /> : null}
        {concept === "spectrum" ? <SpectrumScreen screen={screen} /> : null}
      </section>

      <aside className={styles.reviewNote}>
        <span>REVIEW LENS</span>
        <p>Judge the system—not only the hero. Switch product screens to see whether the same identity survives forms, status, transactions and technical content.</p>
      </aside>
    </main>
  );
}

function LoomScreen({ screen }: { screen: Screen }) {
  return (
    <div className={`${styles.product} ${styles.loom}`}>
      <LoomHeader />
      {screen === "home" ? <LoomHome /> : null}
      {screen === "dashboard" ? <LoomDashboard /> : null}
      {screen === "identity" ? <LoomIdentity /> : null}
      {screen === "send" ? <LoomTransaction kind="send" /> : null}
      {screen === "pay" ? <LoomTransaction kind="pay" /> : null}
      {screen === "subdomains" ? <LoomCollection kind="subdomains" /> : null}
      {screen === "history" ? <LoomCollection kind="history" /> : null}
      {screen === "build" ? <LoomCollection kind="build" /> : null}
    </div>
  );
}

function LoomHeader() {
  return (
    <header className={styles.loomHeader}>
      <div className={styles.wordmark}><i />XDCID</div>
      <nav>Find <span>Manage</span> Pay Build</nav>
      <button type="button">0xe82a…e06A</button>
    </header>
  );
}

function LoomHome() {
  return (
    <div className={styles.loomHome}>
      <div className={styles.loomCopy}>
        <p className={styles.kicker}>ONE OWNER / FIVE DESTINATIONS</p>
        <h1>Your wallet<br />has a <em>routeprint.</em></h1>
        <p>Register one name. Route it precisely across every network you use. Keep the keys—and every decision.</p>
        <NameFinder variant="loom" />
        <small>Wallet-owned · Non-custodial · Records stay inspectable</small>
      </div>
      <Routeprint />
    </div>
  );
}

function Routeprint() {
  return (
    <div className={styles.routeprint} aria-label="mohit.xdc resolves to five network destinations">
      <div className={styles.routeName}><span>mohit</span><b>.xdc</b><small>OWNER VERIFIED</small></div>
      <div className={styles.loomLines} aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className={styles.routeEnds}>
        {routes.map((route, index) => (
          <div key={route.chainId} style={{ "--i": index } as React.CSSProperties}>
            <NetworkLogo chainId={route.chainId} size={25} />
            <span>{route.name}</span>
            <code>{route.address}</code>
          </div>
        ))}
      </div>
      <p>Every line is an owner-controlled record—not a decorative connection.</p>
    </div>
  );
}

function LoomDashboard() {
  return (
    <div className={styles.loomWorkspace}>
      <aside><b>mohit.xdc</b><span>Primary identity</span><LoomMiniMap /><button type="button">Register another</button></aside>
      <section>
        <div className={styles.workspaceTitle}><div><p>GOOD MORNING, MOHIT</p><h1>Your identity is fully routed.</h1></div><Status value="5 / 5" label="destinations verified" /></div>
        <div className={styles.loomMetrics}><article><span>Primary ID</span><b>mohit.xdc</b><small>Set by owner · 18 Sep 2026</small></article><article><span>Renewal</span><b>23 months</b><small>Expires 18 Sep 2028</small></article><article><span>Payment activity</span><b>$4,820</b><small>12 verified receipts</small></article></div>
        <RouteTable editable />
      </section>
    </div>
  );
}

function LoomIdentity() {
  return (
    <div className={styles.loomWorkspace}>
      <aside><b>mohit.xdc</b><span>Identity controls</span><ol><li className={styles.active}>Destinations</li><li>Primary ID</li><li>Profile</li><li>Transfer</li><li>Renew</li></ol></aside>
      <section><div className={styles.workspaceTitle}><div><p>NETWORK DESTINATIONS</p><h1>Five routes. One owner.</h1></div><Status value="SYNCED" label="block 86,205,419" /></div><RouteTable editable /><div className={styles.auditStrip}><span>CHANGE PREVIEW</span><p>Updating Base will create one XDC transaction. All other records remain unchanged.</p><button type="button">Review transaction</button></div></section>
    </div>
  );
}

function LoomTransaction({ kind }: { kind: "send" | "pay" }) {
  const isPay = kind === "pay";
  return (
    <div className={styles.loomFlow}>
      <div className={styles.flowIntro}><p>{isPay ? "PAYMENT REQUEST" : "ROUTE A PAYMENT"}</p><h1>{isPay ? "Ask by name.\nReceive precisely." : "Send to a person,\nnot a string."}</h1><p>{isPay ? "Create a signed request with a destination the payer can verify before sending." : "XDCID resolves the destination openly. You approve the final route."}</p><div className={styles.proofList}><span>01 Resolve identity</span><span>02 Inspect route</span><span>03 Sign request</span></div></div>
      <form className={styles.loomForm}><label>{isPay ? "Receive with" : "Send to"}<input value="maya.xdc" readOnly /></label><div className={styles.formSplit}><label>Amount<input value="250.00" readOnly /></label><label>Asset<select defaultValue="USDC"><option>USDC</option></select></label></div><label>{isPay ? "Payer sends from" : "Destination network"}<select defaultValue="Base"><option>Base</option><option>XDC</option></select></label><div className={styles.routeProof}><NetworkLogo chainId={8453} size={28} /><span><b>maya.xdc</b><small>resolves to 0x8b71…2d30</small></span><strong>VERIFIED</strong></div><button type="button">{isPay ? "Create signed link" : "Continue to review"}</button></form>
    </div>
  );
}

function LoomCollection({ kind }: { kind: "subdomains" | "history" | "build" }) {
  const content = {
    subdomains: ["Subdomains", "Delegate without giving up the root.", "Create a scoped identity for a person, product or team."],
    history: ["History", "Every route leaves evidence.", "Inspect registrations, destination edits, payments and ownership changes."],
    build: ["Developers", "Resolve once. Route correctly.", "Use XDCID resolution and payment primitives without rebuilding identity logic."],
  }[kind];
  return <div className={styles.loomCollection}><div><p>{content[0].toUpperCase()}</p><h1>{content[1]}</h1><span>{content[2]}</span><button type="button">{kind === "build" ? "Read the integration guide" : kind === "history" ? "Export activity" : "Create subdomain"}</button></div><div className={styles.ledgerList}>{[1,2,3,4].map((n)=><article key={n}><code>0{n}</code><span><b>{kind === "subdomains" ? ["pay.mohit.xdc","team.mohit.xdc","vault.mohit.xdc","docs.mohit.xdc"][n-1] : kind === "build" ? ["Resolve an identity","Read a destination","Verify ownership","Request payment"][n-1] : ["Base destination updated","Payment received","Primary ID confirmed","mohit.xdc renewed"][n-1]}</b><small>{kind === "history" ? `${n * 2} days ago · confirmed on XDC` : "Owner-controlled · active"}</small></span><i /></article>)}</div></div>;
}

function PassportScreen({ screen }: { screen: Screen }) {
  return <div className={`${styles.product} ${styles.passport}`}><PassportHeader />{screen === "home" ? <PassportHome /> : <PassportInner screen={screen} />}</div>;
}

function PassportHeader() {
  return <header className={styles.passportHeader}><div className={styles.passportMark}>X<span>DC</span>ID</div><nav>Find identity <span>My records</span> Payments For builders</nav><button type="button">Connect wallet</button></header>;
}

function PassportHome() {
  return <div className={styles.passportHome}><div className={styles.passportHero}><p>THE WALLET-OWNED IDENTITY RECORD</p><h1>A name with<br /><i>receipts.</i></h1><span>XDCID makes ownership and every network destination visible—so people know exactly where value will arrive.</span><NameFinder variant="passport" /></div><div className={styles.passportObject}><div className={styles.cutout}>X</div><small>IDENTITY RECORD / #82491</small><h2>mohit.xdc</h2><p>Owned by 0xe82a…e06A</p><div className={styles.passportRoutes}>{routes.map((route)=><div key={route.chainId}><NetworkLogo chainId={route.chainId} size={27}/><span>{route.name}</span><b>✓</b></div>)}</div><footer><span>5 routes</span><span>Verified today</span><span>Non-custodial</span></footer></div></div>;
}

function PassportInner({ screen }: { screen: Screen }) {
  const metaByScreen: Record<Exclude<Screen, "home">, [string, string, string]> = {
    dashboard: ["My records", "Everything your identity proves.", "A readable view of ownership, destinations and activity."],
    identity: ["Identity record", "mohit.xdc", "Edit destinations, public details and ownership settings."],
    send: ["Send", "Address the person.", "We show the exact destination before you approve."],
    pay: ["Payment links", "A request with provenance.", "The recipient, route and amount remain inspectable."],
    subdomains: ["Subdomains", "Issue names. Keep authority.", "Delegate a useful identity without transferring the root."],
    history: ["Activity register", "Nothing important disappears.", "A chronological record of identity and payment actions."],
    build: ["For builders", "Identity primitives, documented.", "Resolution, ownership and payment APIs with explicit states."],
  };
  const meta = metaByScreen[screen as Exclude<Screen, "home">];
  return <div className={styles.passportInner}><div className={styles.passportHeading}><p>{meta[0]}</p><h1>{meta[1]}</h1><span>{meta[2]}</span></div>{screen === "identity" || screen === "dashboard" ? <PassportRecord /> : screen === "send" || screen === "pay" ? <PassportForm pay={screen === "pay"} /> : <PassportIndex kind={screen} />}</div>;
}

function PassportRecord() {
  return <div className={styles.recordLayout}><section><div className={styles.recordStamp}>OWNER<br/>VERIFIED</div><p>PRIMARY IDENTITY</p><h2>mohit.xdc</h2><dl><div><dt>Owner</dt><dd>0xe82a427C…e06A</dd></div><div><dt>Registered</dt><dd>18 Sep 2026</dd></div><div><dt>Expires</dt><dd>18 Sep 2028</dd></div></dl></section><RouteTable editable /></div>;
}

function PassportForm({ pay }: { pay: boolean }) {
  return <div className={styles.passportForm}><section><p>REQUEST DETAILS</p><label>{pay ? "Receive with" : "Send to"}<input value="maya.xdc" readOnly /></label><div><label>Amount<input value="250.00" readOnly /></label><label>Asset<select defaultValue="USDC"><option>USDC</option></select></label></div><label>Network<select defaultValue="Base"><option>Base</option><option>XDC</option></select></label><button type="button">{pay ? "Seal payment request" : "Review destination"}</button></section><aside><small>ROUTE RECEIPT</small><NetworkLogo chainId={8453} size={42}/><b>maya.xdc</b><code>0x8b71…2d30</code><p>Owner-selected Base destination</p><span>✓ record confirmed</span></aside></div>;
}

function PassportIndex({ kind }: { kind: Screen }) {
  const labels = kind === "build" ? ["Resolve","Ownership","Destinations","Payments"] : kind === "subdomains" ? ["pay.mohit.xdc","team.mohit.xdc","vault.mohit.xdc","docs.mohit.xdc"] : ["Base route updated","Payment received","Primary ID changed","Identity renewed"];
  return <div className={styles.passportIndex}>{labels.map((label,index)=><article key={label}><span>0{index+1}</span><h2>{label}</h2><p>{kind === "history" ? "Confirmed on XDC · owner signed" : kind === "build" ? "Reference, examples and explicit failure states" : "Active delegation · controlled by mohit.xdc"}</p><button type="button">Inspect</button></article>)}</div>;
}

function SpectrumScreen({ screen }: { screen: Screen }) {
  return <div className={`${styles.product} ${styles.spectrum}`}><SpectrumHeader />{screen === "home" ? <SpectrumHome /> : <SpectrumInner screen={screen} />}</div>;
}

function SpectrumHeader() {
  return <header className={styles.spectrumHeader}><div><i/><b>XDCID</b></div><nav><span>01 FIND</span><span>02 MANAGE</span><span>03 PAY</span><span>04 BUILD</span></nav><button type="button">0xe82a…e06A</button></header>;
}

function SpectrumHome() {
  return <div className={styles.spectrumHome}><div className={styles.signalField}><div className={styles.signalCore}><span>mohit.xdc</span><small>ONE IDENTITY</small></div>{routes.map((route,index)=><div className={styles.signalRoute} key={route.chainId} style={{ "--i": index } as React.CSSProperties}><NetworkLogo chainId={route.chainId} size={30}/><b>{route.name}</b><code>{route.address}</code></div>)}</div><div className={styles.spectrumCopy}><p>IDENTITY / ROUTING / OWNERSHIP</p><h1>Be readable<br/>everywhere.</h1><span>One wallet-owned name becomes the right destination on every supported network.</span><NameFinder variant="spectrum"/><small>Every route is visible before it is used.</small></div></div>;
}

function SpectrumInner({ screen }: { screen: Screen }) {
  const titles: Record<Exclude<Screen,"home">,[string,string]> = {dashboard:["CONTROL FIELD","One identity. Five live signals."],identity:["ROUTE EDITOR","Move one signal without disturbing the rest."],send:["PAYMENT ROUTER","Resolve. Inspect. Send."],pay:["SIGNED REQUEST","Make the destination self-evident."],subdomains:["IDENTITY BRANCHES","Names with scoped authority."],history:["SIGNAL LOG","A visible record of every change."],build:["RESOLUTION KIT","Composable identity primitives."]};
  const [eyebrow,title]=titles[screen as Exclude<Screen,"home">];
  return <div className={styles.spectrumInner}><div className={styles.spectrumTitle}><p>{eyebrow}</p><h1>{title}</h1></div>{screen === "dashboard" || screen === "identity" ? <SpectrumRoutes edit={screen === "identity"}/> : screen === "send" || screen === "pay" ? <SpectrumFlow pay={screen === "pay"}/> : <SpectrumGrid kind={screen}/>}</div>;
}

function SpectrumRoutes({ edit }: { edit: boolean }) {
  return <div className={styles.spectrumRoutes}><section><div className={styles.identitySignal}><span>PRIMARY ID</span><b>mohit.xdc</b><small>owner 0xe82a…e06A</small></div>{routes.map((route,index)=><article key={route.chainId} style={{"--i":index} as React.CSSProperties}><NetworkLogo chainId={route.chainId} size={28}/><span><b>{route.name}</b><small>{route.state}</small></span><code>{route.address}</code>{edit?<button type="button">Edit</button>:<i>LIVE</i>}</article>)}</section><aside><p>ROUTE HEALTH</p><strong>100<small>%</small></strong><span>5 of 5 destinations verified</span><div className={styles.healthBands}>{routes.map((route)=><i key={route.chainId}/>)}</div><button type="button">{edit?"Review pending edits":"Open identity record"}</button></aside></div>;
}

function SpectrumFlow({ pay }: { pay: boolean }) {
  return <div className={styles.spectrumFlow}><section><span>01</span><label>{pay?"Receive with":"Recipient"}<input value="maya.xdc" readOnly/></label></section><section><span>02</span><div><label>Amount<input value="250.00" readOnly/></label><label>Token<select defaultValue="USDC"><option>USDC</option></select></label></div></section><section><span>03</span><label>{pay?"Payer network":"Route"}<select defaultValue="Base"><option>Base · 0x8b71…2d30</option></select></label></section><aside><p>RESOLVED SIGNAL</p><NetworkLogo chainId={8453} size={48}/><b>maya.xdc</b><code>0x8b71…2d30</code><button type="button">{pay?"Create request":"Review and send"}</button></aside></div>;
}

function SpectrumGrid({ kind }: { kind: Screen }) {
  const labels = kind === "build" ? ["Resolve","Own","Route","Request"] : kind === "subdomains" ? ["pay.mohit.xdc","team.mohit.xdc","vault.mohit.xdc","docs.mohit.xdc"] : ["ROUTE UPDATED","PAYMENT RECEIVED","PRIMARY CONFIRMED","RENEWAL COMPLETE"];
  return <div className={styles.spectrumGrid}>{labels.map((label,index)=><article key={label} style={{"--i":index} as React.CSSProperties}><span>0{index+1}</span><h2>{label}</h2><p>{kind === "history"?"Owner-signed · confirmed · inspectable":kind === "build"?"A small primitive with explicit success and failure states":"Scoped identity · active signal"}</p><button type="button">OPEN</button></article>)}</div>;
}

function NameFinder({ variant }: { variant: Concept }) {
  return <div className={styles.nameFinder} data-variant={variant}><label><span className="sr-only">Find an XDCID</span><input placeholder="Find your name"/><b>.xdc</b></label><button type="button">Check name</button></div>;
}

function RouteTable({ editable }: { editable?: boolean }) {
  return <div className={styles.routeTable}>{routes.map((route,index)=><article key={route.chainId}><span>0{index+1}</span><NetworkLogo chainId={route.chainId} size={30}/><div><b>{route.name}</b><small>{route.state}</small></div><code>{route.address}</code>{editable?<button type="button">Edit route</button>:<i>✓</i>}</article>)}</div>;
}

function LoomMiniMap() {
  return <div className={styles.miniMap}><i/><i/><i/><i/><i/></div>;
}

function Status({ value, label }: { value: string; label: string }) {
  return <div className={styles.status}><strong>{value}</strong><span>{label}</span></div>;
}
