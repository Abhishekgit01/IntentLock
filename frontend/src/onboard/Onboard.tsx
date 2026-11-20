import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Download,
  FileJson2,
  Play,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Link } from "react-router";
import {
  ONBOARD_COPY,
  RULE_COPY,
  TRANSACTION_COPY,
  VERIFIER_INTERFACE,
  CHECKLIST_COPY,
} from "./content";
import {
  checkVerifierHashes,
  compilePolicy,
  decodeSample,
  lintPolicy,
  runConformance,
} from "./api";
import {
  DRAFT_VALUE_KEYS,
  draftFromPolicy,
  parsePolicyText,
  policyFileFromDraft,
  POLICY_TEMPLATES,
  VERIFIER_THRESHOLD,
} from "./policy";
import type {
  ApiResult,
  CompileResult,
  ConformanceResult,
  DecodeResult,
  LintIssue,
  PolicyDraft,
  PolicyFile,
} from "./types";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-edge bg-flame px-5 py-2.5 font-display font-bold uppercase text-on-flame transition-colors hover:bg-flame-deep motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-on-contrast/35 px-5 py-2.5 font-display font-bold uppercase text-on-contrast transition-colors hover:border-flame hover:text-flame motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass =
  "min-h-11 w-full rounded-xl border border-edge bg-paper px-3 py-2 font-mono text-sm text-ink outline-none focus:border-flame";

function SourceBadge({ preview }: { preview: boolean }) {
  void preview;
  return null;
}

function PanelHeader({
  title,
  description,
  preview,
}: {
  title: string;
  description?: string;
  preview: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight text-on-contrast">
          {title}
        </h2>
        {description && <p className="mt-3 max-w-3xl text-sm text-on-contrast/70">{description}</p>}
      </div>
      <SourceBadge preview={preview} />
    </div>
  );
}

function fileText(file: File): Promise<string> {
  return file.text();
}

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

function formatPolicyError(error: unknown) {
  return error instanceof Error ? error.message : ONBOARD_COPY.parseError;
}

export default function Onboard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFromPolicy(POLICY_TEMPLATES.sample));
  const [policyJson, setPolicyJson] = useState(() =>
    JSON.stringify(POLICY_TEMPLATES.sample, null, 2),
  );
  const [policyJsonError, setPolicyJsonError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [sourceName, setSourceName] = useState<string>(ONBOARD_COPY.templateLabels.sample);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<ApiResult<CompileResult> | null>(null);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [compileBusy, setCompileBusy] = useState(false);
  const [decodeBusy, setDecodeBusy] = useState<string | null>(null);
  const [decodeResults, setDecodeResults] = useState<Record<string, ApiResult<DecodeResult>>>({});
  const [verifierAddresses, setVerifierAddresses] = useState<string[]>(["", "", ""]);
  const [verifierChecks, setVerifierChecks] = useState<ApiResult<
    Array<{ address: string; match: "match" | "mismatch" | "not-checked" }>
  > | null>(null);
  const [conformance, setConformance] = useState<ApiResult<ConformanceResult> | null>(null);
  const [conformanceBusy, setConformanceBusy] = useState(false);
  const [humanReviewed, setHumanReviewed] = useState(false);
  const [checklist, setChecklist] = useState<boolean[]>(() => CHECKLIST_COPY.map(() => false));
  const fileInput = useRef<HTMLInputElement>(null);

  const policy = useMemo(() => policyFileFromDraft(draft), [draft]);
  const progress = Math.round((step / (ONBOARD_COPY.stepNames.length - 1)) * 100);
  const hasLintErrors = lintIssues.some((issue) => issue.severity === "error");
  const currentPreview = false;

  useEffect(() => {
    setPolicyJson(JSON.stringify(policy, null, 2));
  }, [policy]);

  function invalidatePolicyResults() {
    setCompiled(null);
    setLintIssues([]);
    setVerifierChecks(null);
    setDecodeResults({});
    setConformance(null);
  }

  function choosePolicy(value: PolicyFile, name: string) {
    setDraft(draftFromPolicy(value));
    setSourceName(name);
    setError(null);
    setPolicyJsonError(null);
    invalidatePolicyResults();
    setStep(1);
  }

  async function loadText(text: string, name: string) {
    try {
      choosePolicy(parsePolicyText(text), name);
    } catch {
      setError(ONBOARD_COPY.parseError);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void fileText(file).then((text) => loadText(text, file.name));
  }

  function onFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void fileText(file).then((text) => loadText(text, file.name));
  }

  async function compileAndLint() {
    setCompileBusy(true);
    setError(null);
    try {
      const [compileResult, lintResult] = await Promise.all([
        compilePolicy(policy),
        lintPolicy(draft),
      ]);
      setCompiled(compileResult);
      setLintIssues(lintResult.data.issues);
    } catch (caught) {
      setError(formatPolicyError(caught) || ONBOARD_COPY.compileError);
    } finally {
      setCompileBusy(false);
    }
  }

  function updatePolicy(next: PolicyFile) {
    setDraft((current) => ({ ...current, ...next }));
    invalidatePolicyResults();
  }

  function applyPolicyJson() {
    try {
      const parsed = parsePolicyText(policyJson);
      updatePolicy(parsed);
      setSourceName(ONBOARD_COPY.jsonEditorSource);
      setPolicyJsonError(null);
      setLintIssues([]);
    } catch (caught) {
      setPolicyJsonError(formatPolicyError(caught));
    }
  }

  function updateCap(path: "native" | "erc20", value: string) {
    setDraft((current) =>
      path === "native"
        ? { ...current, native: { ...current.native, maxTransferWei: value } }
        : { ...current, erc20: { ...current.erc20, maxTransferBaseUnits: value } },
    );
    invalidatePolicyResults();
  }

  function updateRecipients(path: "native" | "erc20", value: string) {
    const recipients = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setDraft((current) =>
      path === "native"
        ? { ...current, native: { ...current.native, allowedRecipients: recipients } }
        : { ...current, erc20: { ...current.erc20, allowedRecipients: recipients } },
    );
    invalidatePolicyResults();
  }

  async function runDecode(id: string) {
    const sample = TRANSACTION_COPY.find((item) => item.id === id);
    if (!sample) return;
    setDecodeBusy(id);
    setError(null);
    try {
      const result = await decodeSample(sample);
      setDecodeResults((current) => ({ ...current, [id]: result }));
    } catch (caught) {
      setError(formatPolicyError(caught) || ONBOARD_COPY.apiError);
    } finally {
      setDecodeBusy(null);
    }
  }

  async function checkHashes() {
    const addresses = verifierAddresses.filter((address) => address.trim());
    try {
      const result = await checkVerifierHashes(compiled?.data.policyHash ?? null, addresses);
      setVerifierChecks(result);
    } catch (caught) {
      setError(formatPolicyError(caught) || ONBOARD_COPY.apiError);
    }
  }

  async function runVerifierConformance() {
    setConformanceBusy(true);
    setError(null);
    try {
      setConformance(await runConformance());
    } catch (caught) {
      setError(formatPolicyError(caught) || ONBOARD_COPY.apiError);
    } finally {
      setConformanceBusy(false);
    }
  }

  function goNext() {
    setError(null);
    setStep((current) => Math.min(current + 1, ONBOARD_COPY.stepNames.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  function setVerifierAddress(index: number, value: string) {
    setVerifierAddresses((current) =>
      current.map((address, slot) => (slot === index ? value : address)),
    );
    setVerifierChecks(null);
  }

  function setChecklistItem(index: number, checked: boolean) {
    setChecklist((current) => current.map((value, slot) => (slot === index ? checked : value)));
  }

  function reset() {
    setStep(0);
    setDraft(draftFromPolicy(POLICY_TEMPLATES.sample));
    setPolicyJsonError(null);
    setSourceName(ONBOARD_COPY.templateLabels.sample);
    setCompiled(null);
    setLintIssues([]);
    setDecodeResults({});
    setVerifierChecks(null);
    setConformance(null);
    setHumanReviewed(false);
    setChecklist(CHECKLIST_COPY.map(() => false));
    setError(null);
  }

  const readinessItems = [
    { label: ONBOARD_COPY.policyName, ready: Boolean(compiled) },
    { label: ONBOARD_COPY.humanReviewRequired, ready: humanReviewed },
    {
      label: ONBOARD_COPY.health,
      ready: Boolean(
        verifierChecks?.data.length === 3 &&
        verifierChecks.data.every((item) => item.match === "match"),
      ),
    },
    {
      label: ONBOARD_COPY.conformanceTitle,
      ready: Boolean(
        conformance?.data.executed && conformance.data.passed === conformance.data.total,
      ),
    },
    { label: ONBOARD_COPY.deployTitle, ready: checklist.every(Boolean) },
  ];
  const readyForReview = readinessItems.every((item) => item.ready) && !hasLintErrors;

  function downloadPolicy() {
    downloadText(
      ONBOARD_COPY.downloadNames.policy,
      compiled?.data.canonicalPolicyJson ?? `${JSON.stringify(policy, null, 2)}\n`,
      "application/json",
    );
  }

  function downloadVerifierBundle() {
    const bundle = {
      schema: "intentlock.verifier-bundle.v1",
      policyHash: compiled?.data.policyHash ?? null,
      decoderVersion: "native-erc20-transfer-v1",
      threshold: VERIFIER_THRESHOLD,
      verifierAddresses,
      privateKeyIncluded: false,
    };
    downloadText(
      ONBOARD_COPY.downloadNames.verifier,
      `${JSON.stringify(bundle, null, 2)}\n`,
      "application/json",
    );
  }

  function downloadRunbook() {
    const body = [
      `# ${ONBOARD_COPY.readinessTitle}`,
      "",
      `Policy source: ${sourceName}`,
      `Policy hash: ${compiled?.data.policyHash ?? "not compiled"}`,
      "",
      ...CHECKLIST_COPY.map(
        (item, index) => `${index + 1}. [${checklist[index] ? "x" : " "}] ${item}`,
      ),
      "",
      ONBOARD_COPY.privacyNote,
      "",
      "Only responses received from the configured API are represented as backend results.",
    ].join("\n");
    downloadText(ONBOARD_COPY.downloadNames.runbook, `${body}\n`, "text/markdown");
  }

  function changeSelectedFile() {
    fileInput.current?.click();
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-8 md:px-10">
      <nav
        aria-label={ONBOARD_COPY.homeLink}
        className="mb-8 inline-flex rounded-full border-2 border-edge bg-paper/90 px-5 py-2.5 shadow-sm"
      >
        <Link
          to="/"
          className="font-display text-sm font-extrabold uppercase tracking-tight text-ink transition-colors hover:text-flame motion-reduce:transition-none"
        >
          {ONBOARD_COPY.homeLink}
        </Link>
      </nav>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <p className="eyebrow">{ONBOARD_COPY.eyebrow}</p>
          <h1 className="mt-3 font-display text-[clamp(2.5rem,7vw,5.5rem)] font-extrabold uppercase leading-[0.88] tracking-[-0.06em]">
            {ONBOARD_COPY.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-soft">{ONBOARD_COPY.introduction}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="font-mono text-[10px] uppercase tracking-wider text-soft">
            {ONBOARD_COPY.privacyNote}
          </span>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-3xl border-2 border-edge bg-contrast p-5 text-on-contrast">
          <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-on-contrast/60">
            <span>{ONBOARD_COPY.progressLabel}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-on-contrast/10">
            <div
              className="h-full rounded-full bg-flame transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ol className="mt-5 grid gap-2">
            {ONBOARD_COPY.stepNames.map((name, index) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  aria-current={step === index ? "step" : undefined}
                  className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors motion-reduce:transition-none ${step === index ? "bg-flame text-on-flame" : "text-on-contrast hover:bg-on-contrast/10"}`}
                >
                  <span
                    className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold ${step === index ? "border-on-flame/30" : "border-on-contrast/30"}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block font-display font-bold uppercase">{name}</span>
                    <span
                      className={`mt-1 block text-xs leading-snug ${step === index ? "text-on-flame/75" : "text-on-contrast/55"}`}
                    >
                      {ONBOARD_COPY.stepDescriptions[index]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={reset}
            className="mt-5 w-full rounded-full border border-on-contrast/30 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-on-contrast/75 hover:border-flame hover:text-flame"
          >
            {ONBOARD_COPY.startOver}
          </button>
        </aside>

        <main className="min-w-0 rounded-3xl border-2 border-edge bg-contrast p-5 text-on-contrast md:p-8">
          <div className="mb-5 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-on-contrast/50">
            <span>
              {ONBOARD_COPY.stepLabel} {String(step + 1).padStart(2, "0")} /{" "}
              {ONBOARD_COPY.stepNames.length}
            </span>
            <SourceBadge preview={currentPreview} />
          </div>

          {step === 0 && (
            <section>
              <PanelHeader
                title={ONBOARD_COPY.stepNames[0]}
                description={ONBOARD_COPY.stepDescriptions[0]}
                preview
              />
              <button
                type="button"
                onClick={() =>
                  choosePolicy(POLICY_TEMPLATES.sample, ONBOARD_COPY.templateLabels.sample)
                }
                className={`${buttonClass} mb-6`}
              >
                <FileJson2 className="size-4" aria-hidden />
                {ONBOARD_COPY.sampleButton}
              </button>
              <div className="grid gap-5 xl:grid-cols-2">
                <div
                  className="rounded-2xl border border-dashed border-on-contrast/35 p-5"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onFileDrop}
                >
                  <p className="eyebrow text-on-contrast/65">{ONBOARD_COPY.uploadTitle}</p>
                  <p className="mt-2 text-sm text-on-contrast/60">
                    {ONBOARD_COPY.uploadDescription}
                  </p>
                  <button
                    type="button"
                    onClick={changeSelectedFile}
                    className={`${secondaryButtonClass} mt-4`}
                  >
                    <Upload className="size-4" aria-hidden />
                    {ONBOARD_COPY.uploadButton}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/json,.json,.txt"
                    onChange={onFileChange}
                    className="sr-only"
                    aria-label={ONBOARD_COPY.uploadTitle}
                  />
                </div>
                <div>
                  <label htmlFor="policy-paste" className="eyebrow text-on-contrast/65">
                    {ONBOARD_COPY.pasteTitle}
                  </label>
                  <textarea
                    id="policy-paste"
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder={ONBOARD_COPY.pastePlaceholder}
                    rows={7}
                    className={`${fieldClass} mt-2 resize-y`}
                  />
                  <button
                    type="button"
                    onClick={() => void loadText(pasteText, ONBOARD_COPY.policyName)}
                    className={`${secondaryButtonClass} mt-3`}
                  >
                    <FileJson2 className="size-4" aria-hidden />
                    {ONBOARD_COPY.parseButton}
                  </button>
                </div>
              </div>
              <div className="mt-7">
                <p className="eyebrow text-on-contrast/65">{ONBOARD_COPY.templateTitle}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {(Object.keys(POLICY_TEMPLATES) as Array<keyof typeof POLICY_TEMPLATES>).map(
                    (id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          choosePolicy(POLICY_TEMPLATES[id], ONBOARD_COPY.templateLabels[id])
                        }
                        className="rounded-2xl border border-on-contrast/20 p-4 text-left transition-colors hover:border-flame motion-reduce:transition-none"
                      >
                        <span className="font-display font-bold uppercase">
                          {ONBOARD_COPY.templateLabels[id]}
                        </span>
                        <span className="mt-2 block text-sm text-on-contrast/60">
                          {ONBOARD_COPY.templateDescriptions[id]}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section>
              <PanelHeader
                title={ONBOARD_COPY.stepNames[1]}
                description={sourceName}
                preview={currentPreview}
              />
              <div
                role="note"
                className="mb-5 rounded-2xl border border-flame/60 bg-flame/10 px-4 py-3 font-display font-bold text-flame"
              >
                {ONBOARD_COPY.humanBanner}
              </div>
              <div className="overflow-x-auto rounded-2xl border border-on-contrast/20">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="bg-on-contrast/5 font-mono text-[10px] uppercase tracking-wider text-on-contrast/60">
                    <tr>
                      {ONBOARD_COPY.ruleColumns.map((column) => (
                        <th key={column} className="px-4 py-3">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RULE_COPY.map((rule) => {
                      const fieldKey = DRAFT_VALUE_KEYS[rule.id];
                      const highlighted = Object.values(decodeResults).some(
                        (result) => result.data.highlightedRuleId === rule.id,
                      );
                      return (
                        <tr
                          key={rule.id}
                          className={`border-t border-on-contrast/15 align-top transition-colors motion-reduce:transition-none ${highlighted ? "bg-flame/10 ring-1 ring-inset ring-flame" : ""}`}
                        >
                          <th
                            scope="row"
                            className="w-[23%] px-4 py-4 font-display text-sm font-bold uppercase"
                          >
                            {rule.rule}
                          </th>
                          <td className="w-[29%] px-4 py-4 text-sm text-on-contrast/65">
                            “{rule.sourceQuote}”
                          </td>
                          <td className="w-[18%] px-4 py-4">
                            <span
                              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider ${rule.tag === "ENFORCEABLE" ? "border-ok text-ok" : rule.tag === "PARTIAL" ? "border-flame text-flame" : "border-on-contrast/40 text-on-contrast/65"}`}
                            >
                              {rule.tag}
                            </span>
                            {rule.id === "human-risk-interpretation" && (
                              <span className="mt-2 block font-mono text-[10px] font-bold text-flame">
                                {ONBOARD_COPY.needsHumanDecision}
                              </span>
                            )}
                          </td>
                          <td className="w-[30%] px-4 py-4">
                            {fieldKey === "native-cap" && (
                              <>
                                <label className="eyebrow text-on-contrast/50" htmlFor="native-cap">
                                  {ONBOARD_COPY.nativeCap}
                                </label>
                                <input
                                  id="native-cap"
                                  inputMode="numeric"
                                  value={draft.native.maxTransferWei}
                                  onChange={(event) => updateCap("native", event.target.value)}
                                  className={`${fieldClass} mt-1`}
                                />
                                <label
                                  className="eyebrow mt-3 block text-on-contrast/50"
                                  htmlFor="native-recipients"
                                >
                                  {ONBOARD_COPY.destinationAllowlist}
                                </label>
                                <input
                                  id="native-recipients"
                                  value={draft.native.allowedRecipients.join(", ")}
                                  onChange={(event) =>
                                    updateRecipients("native", event.target.value)
                                  }
                                  placeholder={ONBOARD_COPY.commaSeparated}
                                  className={`${fieldClass} mt-1`}
                                />
                              </>
                            )}
                            {fieldKey === "erc20-cap" && (
                              <>
                                <label className="eyebrow text-on-contrast/50" htmlFor="erc20-cap">
                                  {ONBOARD_COPY.erc20Cap}
                                </label>
                                <input
                                  id="erc20-cap"
                                  inputMode="numeric"
                                  value={draft.erc20.maxTransferBaseUnits}
                                  onChange={(event) => updateCap("erc20", event.target.value)}
                                  className={`${fieldClass} mt-1`}
                                />
                                <label
                                  className="eyebrow mt-3 block text-on-contrast/50"
                                  htmlFor="erc20-recipients"
                                >
                                  {ONBOARD_COPY.erc20Recipients}
                                </label>
                                <input
                                  id="erc20-recipients"
                                  value={draft.erc20.allowedRecipients.join(", ")}
                                  onChange={(event) =>
                                    updateRecipients("erc20", event.target.value)
                                  }
                                  placeholder={ONBOARD_COPY.commaSeparated}
                                  className={`${fieldClass} mt-1`}
                                />
                                <p className="mt-2 text-xs text-on-contrast/55">
                                  {draft.erc20.tokens.length
                                    ? draft.erc20.tokens
                                        .map(
                                          (token) => `${token.address} · ${token.runtimeCodeHash}`,
                                        )
                                        .join(", ")
                                    : ONBOARD_COPY.noTokens}
                                </p>
                              </>
                            )}
                            {fieldKey === "approval" && (
                              <p className="rounded-xl border border-on-contrast/20 px-3 py-2 font-mono text-xs">
                                {ONBOARD_COPY.refusePolicy} · {ONBOARD_COPY.ruleEditLocked}
                              </p>
                            )}
                            {fieldKey === "delegatecall" && (
                              <p className="rounded-xl border border-on-contrast/20 px-3 py-2 font-mono text-xs">
                                {ONBOARD_COPY.refusePolicy} · {ONBOARD_COPY.ruleEditLocked}
                              </p>
                            )}
                            {fieldKey === "human" && (
                              <label className="flex items-start gap-2 text-sm text-on-contrast/75">
                                <input
                                  type="checkbox"
                                  checked={humanReviewed}
                                  onChange={(event) => setHumanReviewed(event.target.checked)}
                                  className="mt-1 accent-flame"
                                />
                                {ONBOARD_COPY.humanReviewCheck}
                              </label>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <details className="mt-5 rounded-2xl border border-on-contrast/20 p-4">
                <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-on-contrast/80">
                  {ONBOARD_COPY.jsonEditorTitle}
                </summary>
                <p className="mt-3 max-w-3xl text-sm text-on-contrast/60">
                  {ONBOARD_COPY.jsonEditorDescription}
                </p>
                <label className="sr-only" htmlFor="policy-json-editor">
                  {ONBOARD_COPY.jsonField}
                </label>
                <textarea
                  id="policy-json-editor"
                  spellCheck={false}
                  value={policyJson}
                  onChange={(event) => setPolicyJson(event.target.value)}
                  rows={18}
                  className={`${fieldClass} mt-4 resize-y font-mono text-xs leading-6`}
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={applyPolicyJson} className={secondaryButtonClass}>
                    {ONBOARD_COPY.applyJson}
                  </button>
                  {policyJsonError && (
                    <p role="alert" className="text-sm text-bad">
                      {policyJsonError}
                    </p>
                  )}
                </div>
              </details>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void compileAndLint()}
                  disabled={compileBusy}
                  className={buttonClass}
                >
                  {compileBusy ? ONBOARD_COPY.running : ONBOARD_COPY.compileAndLint}
                </button>
                {compiled && (
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-xs text-on-contrast/60">
                      {compiled.data.policyHash}
                    </p>
                    {compiled.data.canonicalPolicyJson && (
                      <details className="mt-3 rounded-xl border border-on-contrast/20 p-3">
                        <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-on-contrast/70">
                          Backend canonical policy JSON
                        </summary>
                        <pre className="mt-3 overflow-auto text-xs text-on-contrast/70">
                          {compiled.data.canonicalPolicyJson}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
              {lintIssues.length > 0 && (
                <ul className="mt-4 grid gap-2" aria-label={ONBOARD_COPY.stepNames[1]}>
                  {lintIssues.map((issue, index) => (
                    <li
                      key={`${issue.code}-${index}`}
                      className={`rounded-xl border px-3 py-2 text-sm ${issue.severity === "error" ? "border-bad text-bad" : "border-flame/40 text-flame"}`}
                    >
                      {issue.code} · {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <PanelHeader
                title={ONBOARD_COPY.stepNames[2]}
                description={ONBOARD_COPY.simulateDescription}
                preview={currentPreview}
              />
              <div className="grid gap-4">
                {TRANSACTION_COPY.map((sample) => {
                  const result = decodeResults[sample.id];
                  const match = result?.data.highlightedRuleId
                    ? RULE_COPY.find((rule) => rule.id === result.data.highlightedRuleId)
                    : undefined;
                  return (
                    <article
                      key={sample.id}
                      className={`rounded-2xl border p-4 transition-colors motion-reduce:transition-none ${result ? "border-flame" : "border-on-contrast/20"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="font-display text-lg font-bold uppercase">
                            {sample.title}
                          </h3>
                          <p className="mt-1 text-sm text-on-contrast/60">{sample.description}</p>
                          <p className="mt-2 font-mono text-xs text-on-contrast/50">
                            {sample.operation === 1
                              ? ONBOARD_COPY.operationDelegatecall
                              : ONBOARD_COPY.operationCall}{" "}
                            · {sample.valueWei} {ONBOARD_COPY.amountUnit} · {sample.data}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void runDecode(sample.id)}
                          disabled={decodeBusy !== null}
                          className={secondaryButtonClass}
                        >
                          <Play className="size-4" aria-hidden />
                          {decodeBusy === sample.id ? ONBOARD_COPY.running : ONBOARD_COPY.run}
                        </button>
                      </div>
                      {result && (
                        <div className="mt-4 grid gap-3 border-t border-on-contrast/15 pt-4 md:grid-cols-[auto_1fr]">
                          <span
                            className={`h-fit rounded-full border px-3 py-1 font-mono text-[11px] font-bold ${result.data.decision.startsWith("REFUSE") ? "border-bad text-bad" : "border-ok text-ok"}`}
                          >
                            {result.data.decision}
                          </span>
                          <div className="text-sm text-on-contrast/70">
                            <p>
                              {ONBOARD_COPY.matchingRule}:{" "}
                              <strong className="text-on-contrast">
                                {match?.rule ?? ONBOARD_COPY.noMatchingRule}
                              </strong>
                            </p>
                            {result.source === "backend" && (
                              <p className="mt-1 font-mono text-xs">
                                {result.data.reasonCode ?? result.data.decoderVersion} · block{" "}
                                {result.data.source.blockNumber}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {Object.keys(decodeResults).length === 0 && (
                <p className="mt-4 text-sm text-on-contrast/60">{ONBOARD_COPY.noRun}</p>
              )}
            </section>
          )}

          {step === 3 && (
            <section>
              <PanelHeader
                title={ONBOARD_COPY.verifierTitle}
                description={ONBOARD_COPY.verifierDescription}
                preview={currentPreview}
              />
              <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-on-contrast/55">
                {ONBOARD_COPY.verifierHealthSummary}
              </p>
              <div className="grid gap-4 xl:grid-cols-3">
                {verifierAddresses.map((address, index) => {
                  const status = verifierChecks?.data.find(
                    (item) => item.address.toLowerCase() === address.toLowerCase(),
                  )?.match;
                  return (
                    <article key={index} className="rounded-2xl border border-on-contrast/20 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-lg font-bold uppercase">
                          {ONBOARD_COPY.verifierAddresses[index]}
                        </h3>
                        <span
                          className={`rounded-full border px-2 py-1 font-mono text-[9px] font-bold ${status === "match" ? "border-ok text-ok" : status === "mismatch" ? "border-bad text-bad" : "border-on-contrast/30 text-on-contrast/55"}`}
                        >
                          {status === "match"
                            ? ONBOARD_COPY.hashesMatch
                            : status === "mismatch"
                              ? ONBOARD_COPY.hashMismatch
                              : ONBOARD_COPY.healthNotChecked}
                        </span>
                      </div>
                      <label
                        htmlFor={`verifier-${index}`}
                        className="eyebrow mt-4 block text-on-contrast/55"
                      >
                        {ONBOARD_COPY.publicAddress}
                      </label>
                      <input
                        id={`verifier-${index}`}
                        value={address}
                        onChange={(event) => setVerifierAddress(index, event.target.value)}
                        placeholder={ONBOARD_COPY.publicAddressPlaceholder}
                        className={`${fieldClass} mt-1`}
                      />
                      <p className="mt-2 text-xs text-on-contrast/55">
                        {ONBOARD_COPY.addressInputHint}
                      </p>
                      <p className="eyebrow mt-4 text-on-contrast/45">
                        {ONBOARD_COPY.installCommand}
                      </p>
                      <code className="mt-1 block break-all rounded-xl bg-on-contrast/5 p-2 font-mono text-[10px] text-on-contrast/75">
                        {ONBOARD_COPY.verifierInstallCommand}
                      </code>
                    </article>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void checkHashes()}
                className={`${secondaryButtonClass} mt-5`}
              >
                <ShieldCheck className="size-4" aria-hidden />
                {ONBOARD_COPY.checkHashes}
              </button>
              {verifierChecks?.source === "backend" && (
                <p className="mt-3 max-w-3xl text-xs text-on-contrast/55">
                  {ONBOARD_COPY.healthNotChecked}
                </p>
              )}
            </section>
          )}

          {step === 4 && (
            <section>
              <PanelHeader
                title={ONBOARD_COPY.stepNames[4]}
                description={ONBOARD_COPY.interfaceDescription}
                preview={currentPreview}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-on-contrast/20 p-4">
                  <h3 className="eyebrow text-flame">{VERIFIER_INTERFACE.method}</h3>
                  <p className="mt-3 text-sm text-on-contrast/65">
                    {VERIFIER_INTERFACE.request.join("\n")}
                  </p>
                </article>
                <article className="rounded-2xl border border-on-contrast/20 p-4">
                  <h3 className="eyebrow text-flame">{ONBOARD_COPY.interfaceTitle}</h3>
                  <p className="mt-3 text-sm text-on-contrast/65">
                    {VERIFIER_INTERFACE.response.join("\n")}
                  </p>
                </article>
              </div>
              <article className="mt-4 rounded-2xl border border-on-contrast/20 p-4">
                <h3 className="eyebrow text-flame">{ONBOARD_COPY.cliCommandLabel}</h3>
                <code className="mt-3 block break-all font-mono text-xs text-on-contrast/70">
                  {ONBOARD_COPY.verifierCommand}
                </code>
              </article>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void runVerifierConformance()}
                  disabled={conformanceBusy}
                  className={buttonClass}
                >
                  <Play className="size-4" aria-hidden />
                  {conformanceBusy ? ONBOARD_COPY.runningConformance : ONBOARD_COPY.runConformance}
                </button>
                {conformance && (
                  <div className="rounded-2xl border border-flame px-4 py-3">
                    <p className="font-mono text-xs font-bold uppercase tracking-wider text-flame">
                      {ONBOARD_COPY.conformanceTitle}
                    </p>
                    <p className="mt-1 font-display text-2xl font-extrabold text-on-contrast">
                      {conformance.data.passed} / {conformance.data.total}{" "}
                      {ONBOARD_COPY.fixturesLabel}
                    </p>
                    <p className="mt-1 max-w-xl text-xs text-on-contrast/55">
                      {conformance.data.message}
                    </p>
                  </div>
                )}
              </div>
              {conformance && (
                <div
                  className="mt-4 flex flex-wrap gap-1.5"
                  aria-label={ONBOARD_COPY.conformanceTitle}
                >
                  {conformance.data.fixtureResults?.map((fixture) => (
                    <span
                      key={fixture.id}
                      className={`rounded border px-2 py-1 font-mono text-[9px] ${fixture.pass ? "border-ok text-ok" : "border-bad text-bad"}`}
                    >
                      {fixture.id}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {step === 5 && (
            <section>
              <PanelHeader
                title={ONBOARD_COPY.deployTitle}
                description={ONBOARD_COPY.deployDescription}
                preview
              />
              <ol className="grid gap-3">
                {CHECKLIST_COPY.map((item, index) => (
                  <li key={item} className="rounded-2xl border border-on-contrast/20 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checklist[index]}
                        onChange={(event) => setChecklistItem(index, event.target.checked)}
                        className="mt-1 size-4 accent-flame"
                      />
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-on-contrast/25 font-mono text-xs">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-on-contrast/80">{item}</span>
                    </label>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {step === 6 && (
            <section>
              <PanelHeader
                title={ONBOARD_COPY.readinessTitle}
                description={ONBOARD_COPY.readinessDescription}
                preview={currentPreview}
              />
              <div
                className={`rounded-2xl border p-4 font-display text-lg font-bold uppercase ${readyForReview ? "border-ok text-ok" : "border-flame text-flame"}`}
              >
                {readyForReview ? ONBOARD_COPY.statusReady : ONBOARD_COPY.statusIncomplete}
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {readinessItems.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-3 rounded-xl border border-on-contrast/15 px-3 py-3 text-sm"
                  >
                    <span
                      className={`grid size-6 place-items-center rounded-full border ${item.ready ? "border-ok text-ok" : "border-on-contrast/30 text-on-contrast/35"}`}
                    >
                      {item.ready ? (
                        <Check className="size-4" aria-hidden />
                      ) : (
                        <CircleHelp className="size-4" aria-hidden />
                      )}
                    </span>
                    <span className="text-on-contrast/75">{item.label}</span>
                  </li>
                ))}
              </ul>
              {compiled && (
                <p className="mt-5 break-all rounded-xl bg-on-contrast/5 p-3 font-mono text-xs text-on-contrast/65">
                  {compiled.data.policyHash}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={downloadPolicy} className={secondaryButtonClass}>
                  <Download className="size-4" aria-hidden />
                  {ONBOARD_COPY.downloadPolicy}
                </button>
                <button
                  type="button"
                  onClick={downloadVerifierBundle}
                  className={secondaryButtonClass}
                >
                  <Download className="size-4" aria-hidden />
                  {ONBOARD_COPY.downloadVerifier}
                </button>
                <button type="button" onClick={downloadRunbook} className={secondaryButtonClass}>
                  <Download className="size-4" aria-hidden />
                  {ONBOARD_COPY.downloadRunbook}
                </button>
              </div>
            </section>
          )}

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-bad px-4 py-3 text-sm text-bad"
            >
              {error}
            </p>
          )}
          {hasLintErrors && step === 1 && (
            <p role="status" className="mt-3 text-sm text-flame">
              {ONBOARD_COPY.lintError}
            </p>
          )}
          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-on-contrast/15 pt-5">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className={secondaryButtonClass}
            >
              <ArrowLeft className="size-4" aria-hidden />
              {ONBOARD_COPY.back}
            </button>
            {step < ONBOARD_COPY.stepNames.length - 1 && (
              <button type="button" onClick={goNext} className={buttonClass}>
                {ONBOARD_COPY.next}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
