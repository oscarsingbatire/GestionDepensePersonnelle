import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import * as React from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, CalendarDays,
  Check, ChevronDown, ChevronRight, CircleHelp, Home,
  LogOut, Menu, Moon, Pencil, Plus, Search, Settings, ShieldCheck, SlidersHorizontal,
  Sun, Target, Trash2, TrendingDown, Wallet, X, Zap,
} from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  getGetAnalyticsQueryKey, getGetDashboardQueryKey, getGetSettingsQueryKey,
  getListBudgetsQueryKey, getListCategoriesQueryKey, getListExpensesQueryKey,
  useCreateBudget, useCreateCategory, useCreateExpense, useDeleteBudget, useDeleteCategory,
  useDeleteExpense, useGetAnalytics, useGetDashboard, useGetSettings, useListBudgets,
  useListCategories, useListExpenses, useUpdateBudget, useUpdateCategory, useUpdateExpense,
  useUpdateSettings,
} from '@workspace/api-client-react';
import type {
  Budget, BudgetInput, Category, CategoryInput, Expense, ExpenseInput,
  GetAnalyticsParams, ListExpensesParams,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const appearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#244c3c', colorForeground: '#20392f', colorMutedForeground: '#6b7d72',
    colorDanger: '#ae4d43', colorBackground: '#fffdf7', colorInput: '#f5f0e6',
    colorInputForeground: '#20392f', colorNeutral: '#d9d5c9', fontFamily: "'DM Sans', sans-serif", borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fffdf7] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#20392f] font-bold', headerSubtitle: 'text-[#6b7d72]', socialButtonsBlockButtonText: 'text-[#20392f]',
    formFieldLabel: 'text-[#20392f]', footerActionLink: 'text-[#244c3c] font-semibold', footerActionText: 'text-[#6b7d72]',
    dividerText: 'text-[#6b7d72]', identityPreviewEditButton: 'text-[#244c3c]', formFieldSuccessText: 'text-[#244c3c]',
    alertText: 'text-[#ae4d43]', logoBox: 'rounded-xl', logoImage: 'rounded-xl', socialButtonsBlockButton: 'border-[#d9d5c9]',
    formButtonPrimary: 'bg-[#244c3c] hover:bg-[#183d2e]', formFieldInput: 'bg-[#f5f0e6] border-[#d9d5c9] text-[#20392f]',
    footerAction: 'text-[#6b7d72]', dividerLine: 'bg-[#e5dfd1]', alert: 'bg-[#fbefed]',
    otpCodeFieldInput: 'bg-[#f5f0e6] border-[#d9d5c9]', formFieldRow: 'text-[#20392f]', main: 'text-[#20392f]',
  },
};
const frenchLocalization = {
  signIn: { start: { title: 'Ravi de vous revoir', subtitle: 'Retrouvez votre espace de dépenses.' } },
  signUp: { start: { title: 'Votre espace, à vous', subtitle: 'Commencez à suivre vos dépenses simplement.' } },
};

type IconType = typeof Home;
const navItems: { href: string; label: string; icon: IconType }[] = [
  { href: '/dashboard', label: 'Vue d’ensemble', icon: Home }, { href: '/analysis', label: 'Analyses', icon: BarChart3 },
  { href: '/history', label: 'Historique', icon: CalendarDays }, { href: '/budget', label: 'Budgets', icon: Target },
  { href: '/settings', label: 'Réglages', icon: Settings },
];
const formatMoney = (amount: number | null | undefined, currency = 'XAF') => {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} ${currency}`; }
};
const formatDate = (value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('fr-FR', options).format(new Date(value));
const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const periodNames: Record<string, string> = { daily: 'Jour', weekly: 'Semaine', monthly: 'Mois', yearly: 'Année', day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année', custom: 'Période personnalisée' };
const paymentLabels: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile money', card: 'Carte bancaire', bank_transfer: 'Virement', other: 'Autre' };
const palette = ['#315e4b', '#d8ae55', '#d07c67', '#5d9c9a', '#9a7caa', '#71945e', '#ce9655'];

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" data-testid="link-brand" className="brand-lockup">
    <span className="brand-mark"><Wallet size={18} strokeWidth={1.8} /></span>
    {!compact && <span className="brand-name">mes dépenses<span className="brand-dot">.</span></span>}
  </Link>;
}

function Button({ children, onClick, variant = 'primary', type = 'button', className = '', disabled, testId }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; type?: 'button' | 'submit';
  className?: string; disabled?: boolean; testId?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`button btn btn-${variant} ${className}`}>{children}</button>;
}
function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1 className="serif">{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}
function Card({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  return <section className={`panel ${className}`} data-testid={testId}>{children}</section>;
}
function SpinnerBlock({ label = 'Chargement de vos données' }: { label?: string }) {
  return <div className="skeleton-wrap" role="status" aria-label={label}><div className="skeleton-line long" /><div className="skeleton-line medium" /><div className="skeleton-line short" /></div>;
}
function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state" data-testid="state-empty"><div className="empty-art"><span /><span /><span /><Wallet size={23} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function ErrorState({ retry }: { retry: () => void }) {
  return <div className="error-state" data-testid="state-error"><div className="error-icon"><Activity size={18} /></div><strong>Impossible de charger ces données</strong><p>Vérifiez votre connexion puis réessayez.</p><Button variant="secondary" onClick={retry} testId="button-retry">Réessayer</Button></div>;
}
function StatCard({ label, value, foot, icon: Icon, tone = '' }: { label: string; value: string; foot?: string; icon: IconType; tone?: string }) {
  return <Card className="stat-card"><div className="stat-head"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={17} /></span></div><div className="stat-value mono" data-testid={`value-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>{foot && <div className="stat-foot">{foot}</div>}</Card>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [close]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2 className="serif">{title}</h2><button className="icon-button" onClick={close} aria-label="Fermer" data-testid="button-modal-close"><X size={19} /></button></div>{children}</div></div>;
}
function InputField({ label, value, onChange, type = 'text', placeholder, required = false, testId, min, step }: {
  label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; testId: string; min?: string; step?: string;
}) {
  return <label className="field"><span>{label}</span><input data-testid={testId} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} min={min} step={step} /></label>;
}
function SelectField({ label, value, onChange, children, testId }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; testId: string }) {
  return <label className="field"><span>{label}</span><div className="select-wrap"><select data-testid={testId} value={value} onChange={e => onChange(e.target.value)}>{children}</select><ChevronDown size={15} /></div></label>;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetAnalyticsQueryKey({ period: 'month' }) });
    void qc.invalidateQueries({ queryKey: ['/api/analytics'] });
    void qc.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  };
}

function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: settings } = useGetSettings();
  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, [settings?.theme]);
  return <div className="app-frame noise">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="side-top"><Brand /><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu"><X size={18} /></button></div>
      <div className="side-caption">VOTRE ESPACE</div>
      <nav className="side-nav" aria-label="Navigation principale">
        {navItems.map(item => { const Icon = item.icon; const active = location === item.href;
          return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`nav-link ${active ? 'active' : ''}`} data-testid={`link-${item.href.slice(1)}`}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{active && <span className="nav-active-dot" />}</Link>; })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="side-prompt"><div className="prompt-symbol"><ShieldCheck size={17} /></div><strong>Votre espace, vos repères.</strong><p>Vos dépenses restent privées et accessibles à vous seul.</p></div>
      <button className="profile-row" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">
        <div className="profile-avatar">{user?.firstName?.[0] ?? user?.emailAddresses[0]?.emailAddress[0] ?? 'M'}</div>
        <div className="profile-copy"><strong>{user?.firstName || 'Mon espace'}</strong><span>Se déconnecter</span></div><LogOut size={16} />
      </button>
    </aside>
    {menuOpen && <button className="mobile-scrim" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Menu size={20} /></button><div className="crumb"><span>Mon espace</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="topbar-tools"><span className="privacy-tag"><span />Données privées</span><Link href="/add" className="quick-add" data-testid="link-quick-add"><Plus size={16} /><span>Ajouter une dépense</span></Link></div></header>
      <div className="page-content page-enter">{children}</div>
      <footer className="app-footer"><span>Un peu plus de clarté, chaque jour.</span><span>Mes Dépenses <i>·</i> FCFA</span></footer>
    </main>
  </div>;
}

function PublicHome() {
  return <>
    <Show when="signed-in"><Redirect to="/dashboard" /></Show>
    <Show when="signed-out"><div className="welcome noise">
      <header className="welcome-nav"><Brand /><div className="welcome-links"><a href="#approche">L’approche</a><a href="#confidentialite">Confidentialité</a></div><div className="welcome-actions"><Link href="/sign-in" className="login-link" data-testid="link-sign-in">Se connecter</Link><Link href="/sign-up" className="welcome-cta" data-testid="link-sign-up">Créer mon espace <ArrowRight size={15} /></Link></div></header>
      <section className="welcome-hero">
        <div className="hero-copy"><div className="hero-kicker"><span className="kicker-line" />VOTRE QUOTIDIEN, PLUS LISIBLE</div><h1 className="serif">Chaque dépense<br />a <em>sa place.</em></h1><p>Un espace personnel pour noter vos dépenses en FCFA, comprendre vos habitudes et avancer avec un peu plus de sérénité.</p><div className="hero-buttons"><Link href="/sign-up" className="hero-primary" data-testid="link-start-now">Ouvrir mon espace <ArrowRight size={17} /></Link><span className="hero-note"><ShieldCheck size={15} /> Privé par nature</span></div><div className="hero-footnote"><span className="footnote-rule" />Simple à tenir. Facile à retrouver.</div></div>
        <div className="hero-illustration" aria-label="Illustration d'un carnet de dépenses">
          <div className="sun-shape" /><div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="note-card"><div className="note-top"><div><span className="note-overline">MON CARNET</span><strong>Une vue plus claire</strong></div><span className="note-icon"><Activity size={17} /></span></div>
            <div className="note-graph"><div className="graph-labels"><span>Mes dépenses</span><span>Au fil des jours</span></div><div className="graph-bars">{[26,43,34,62,45,76,57,85,67,92,72,100,79,88,63,95].map((h,i)=><i key={i} style={{height:`${h}%`,opacity:.35+i*.035}} />)}</div><div className="graph-bottom"><span>Sans pression, à votre rythme</span><span className="graph-dot" /></div></div>
            <div className="note-list"><div className="note-list-row"><span className="mini-color coral" /><span>Une habitude après l’autre</span><ArrowRight size={14} /></div><div className="note-list-row"><span className="mini-color gold" /><span>Des repères qui vous ressemblent</span><ArrowRight size={14} /></div></div>
          </div><div className="hero-orb-label"><div className="orb-check"><Check size={16} /></div><span>Rien à deviner.<br /><b>Vos données seulement.</b></span></div>
        </div>
      </section>
      <section className="manifesto" id="approche"><div className="manifesto-index">01 <span>—</span> UNE AUTRE FAÇON DE SUIVRE</div><h2 className="serif">Moins de tableaux.<br /><em>Plus de compréhension.</em></h2><p>Mes Dépenses ne prédit rien et n’invente rien. Il rassemble ce que vous notez, puis le rend facile à relire.</p><div className="manifesto-mark">MD.</div></section>
      <section className="welcome-steps"><div className="section-intro"><div className="eyebrow">VOTRE RYTHME, VOTRE MÉTHODE</div><h2 className="serif">Un geste simple.<br />Des habitudes plus nettes.</h2></div><div className="step-list"><article><span>01</span><div><h3>Notez sur le moment</h3><p>Montant, catégorie, moyen de paiement. Quelques détails suffisent pour garder la trace.</p></div><Plus size={20} /></article><article><span>02</span><div><h3>Retrouvez sans chercher</h3><p>Un historique filtrable garde chaque achat à portée de main, même des semaines plus tard.</p></div><Search size={19} /></article><article><span>03</span><div><h3>Regardez ce qui se dessine</h3><p>Des graphiques et des budgets construits uniquement à partir de vos dépenses réelles.</p></div><BarChart3 size={19} /></article></div></section>
      <section className="welcome-private" id="confidentialite"><div className="private-emblem"><ShieldCheck size={27} /></div><div><div className="eyebrow">UN ESPACE PERSONNEL</div><h2 className="serif">Vos chiffres.<br /><em>Votre regard.</em></h2><p>Vos dépenses sont à vous. Pas de classement, pas de jugement, pas de données fabriquées pour remplir l’écran. Juste les repères que vous choisissez de créer.</p><Link href="/sign-up" className="text-link" data-testid="link-private-create">Créer mon espace <ArrowRight size={15} /></Link></div><div className="private-side-note">UNE VIE PLUS LISIBLE, À VOTRE FAÇON</div></section>
      <section className="welcome-end"><div className="end-stamp">MES<br />DÉPENSES</div><div><div className="eyebrow">ON COMMENCE QUAND VOUS VOULEZ</div><h2 className="serif">Un peu plus de clarté,<br /><em>chaque jour.</em></h2></div><Link href="/sign-up" className="hero-primary" data-testid="link-create-account">Ouvrir mon espace <ArrowRight size={17} /></Link></section>
      <footer className="welcome-footer"><Brand /><span>Votre quotidien, plus lisible.</span><span>© Mes Dépenses</span></footer>
     </div></Show>
  </>;
}

function Secure({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}
function DashboardPage() {
  const { data, isLoading, isError, refetch } = useGetDashboard();
  const { data: settings } = useGetSettings();
  const currency = settings?.currency ?? 'XAF';
  const hasData = !!data && (data.expenseCount > 0 || data.budgetTotal != null);
  return <AppShell title="Vue d’ensemble">
    <PageTitle eyebrow={new Intl.DateTimeFormat('fr-FR', { weekday:'long', day:'numeric', month:'long' }).format(new Date())} title="Votre espace, aujourd’hui." description="Un aperçu fidèle de ce que vous avez noté." action={<Link href="/add" className="btn btn-primary button title-action" data-testid="link-add-expense"><Plus size={17} />Ajouter une dépense</Link>} />
    {isLoading ? <SpinnerBlock /> : isError ? <ErrorState retry={() => void refetch()} /> : !hasData ? <div className="welcome-empty-panel"><EmptyState title="On commence par une première note ?" text="Ajoutez une dépense pour faire apparaître vos repères ici. Aucune donnée ne sera inventée." action={<Link href="/add" className="btn btn-primary button" data-testid="link-first-expense"><Plus size={16} />Noter ma première dépense</Link>} /></div> :
    <>
      <div className="stats-grid">
        <StatCard label="Aujourd’hui" value={formatMoney(data?.today, currency)} foot="Dépenses du jour" icon={Sun} tone="tone-gold" />
        <StatCard label="Cette semaine" value={formatMoney(data?.week, currency)} foot="Du lundi à aujourd’hui" icon={CalendarDays} tone="tone-green" />
        <StatCard label="Ce mois" value={formatMoney(data?.month, currency)} foot={`${data?.expenseCount ?? 0} dépense${data?.expenseCount === 1 ? '' : 's'} enregistrée${data?.expenseCount === 1 ? '' : 's'}`} icon={Wallet} tone="tone-coral" />
        <StatCard label="Moyenne dépense" value={formatMoney(data?.averageAmount, currency)} foot="Sur vos dépenses enregistrées" icon={Activity} tone="tone-blue" />
      </div>
      <div className="dashboard-grid">
        <Card className="budget-overview">
          <div className="panel-heading"><div><div className="eyebrow">CAP DU MOIS</div><h2 className="serif">Votre budget</h2></div><Link href="/budget" className="subtle-link" data-testid="link-budget-overview">Voir le budget <ArrowRight size={14} /></Link></div>
          {data?.budgetTotal == null ? <div className="budget-empty"><div className="budget-empty-mark"><Target size={21} /></div><div><strong>Pas encore de budget mensuel</strong><p>Vous pouvez en définir un quand vous le souhaitez.</p></div><Link href="/budget" className="arrow-square" aria-label="Créer un budget"><ArrowRight size={17} /></Link></div> : <>
            <div className="budget-amount-row"><div><span>Déjà utilisé</span><strong className="mono">{formatMoney(data?.budgetSpent, currency)}</strong></div><div className="budget-remaining"><span>Disponible</span><strong className="mono">{formatMoney(data?.budgetRemaining, currency)}</strong></div></div>
             <div className="budget-track"><i className={data?.budgetTotal && data.budgetSpent / data.budgetTotal >= 0.8 ? 'over-budget' : ''} style={{width:`${Math.min(100, data?.budgetTotal ? (data.budgetSpent/data.budgetTotal)*100 : 0)}%`}} /></div>
             <div className="budget-caption"><span>{data?.budgetTotal ? (data.budgetSpent / data.budgetTotal >= 1 ? 'Budget dépassé' : data.budgetSpent / data.budgetTotal >= 0.8 ? 'Budget bientôt atteint' : `${Math.round((data.budgetSpent/data.budgetTotal)*100)} % du budget`) : 'Budget mensuel'}</span><span>sur {formatMoney(data?.budgetTotal, currency)}</span></div>
          </>}
        </Card>
        <Card className="top-category-card">
          <div className="eyebrow">VOTRE PRINCIPAL POSTE</div><h2 className="serif">Là où ça compte.</h2>
          {data?.topCategory ? <div className="category-feature"><span className="category-feature-dot" /><div><strong>{data.topCategory.name}</strong><span>{formatMoney(data.topCategory.amount, currency)} <i>·</i> {Math.round(data.topCategory.share)} %</span></div><div className="donut-mini" style={{'--share':`${data.topCategory.share}%`} as React.CSSProperties}><span>{Math.round(data.topCategory.share)}%</span></div></div> : <p className="muted-note">Vos catégories apparaîtront avec vos prochaines dépenses.</p>}
          <Link href="/analysis" className="subtle-link" data-testid="link-top-category">Explorer les analyses <ArrowRight size={14} /></Link>
        </Card>
      </div>
      <Card className="recent-card"><div className="panel-heading"><div><div className="eyebrow">LES PLUS RÉCENTES</div><h2 className="serif">Vos dernières notes</h2></div><Link href="/history" className="subtle-link" data-testid="link-all-history">Tout l’historique <ArrowRight size={14} /></Link></div>
        {data?.recentExpenses?.length ? <div className="expense-list">{data.recentExpenses.slice(0,5).map((expense,i)=><ExpenseRow key={expense.id} expense={expense} currency={currency} index={i} />)}</div> : <EmptyState title="Votre carnet est encore vide" text="Chaque dépense ajoutée restera ici, prête à être retrouvée." action={<Link href="/add" className="text-link" data-testid="link-add-from-recent">Ajouter une note <ArrowRight size={14} /></Link>} />}
      </Card>
    </>}
  </AppShell>;
}

function ExpenseRow({ expense, currency, index, onEdit, onDelete }: { expense: Expense; currency: string; index: number; onEdit?: (expense: Expense) => void; onDelete?: (expense: Expense) => void }) {
  return <div className="expense-row row-hover" data-testid={`row-expense-${expense.id}`}><div className="expense-avatar" style={{'--expense-color':palette[index % palette.length]} as React.CSSProperties}>{expense.categoryName.slice(0,1).toLocaleUpperCase('fr')}</div><div className="expense-copy"><strong>{expense.description}</strong><span>{expense.categoryName}<i>·</i>{formatDate(expense.occurredAt, { day:'numeric', month:'short', year:'numeric' })}</span></div><div className="expense-method">{paymentLabels[expense.paymentMethod] ?? expense.paymentMethod}</div><strong className="expense-amount mono">{formatMoney(expense.amount, currency)}</strong>{(onEdit || onDelete) && <div className="row-actions">{onEdit && <button className="icon-button small" onClick={() => onEdit(expense)} aria-label="Modifier" data-testid={`button-edit-expense-${expense.id}`}><Pencil size={15} /></button>}{onDelete && <button className="icon-button small danger-icon" onClick={() => onDelete(expense)} aria-label="Supprimer" data-testid={`button-delete-expense-${expense.id}`}><Trash2 size={15} /></button>}</div>}</div>;
}
function ExpenseForm({ categories, initial, onSave, saving, onCancel }: { categories: Category[]; initial?: Expense; onSave: (data: ExpenseInput) => void; saving: boolean; onCancel?: () => void }) {
  const [amount,setAmount] = useState(initial ? String(initial.amount) : '');
  const [description,setDescription] = useState(initial?.description ?? '');
  const [categoryId,setCategoryId] = useState(initial?.categoryId ? String(initial.categoryId) : categories[0]?.id ? String(categories[0].id) : '');
   const [occurredAt,setOccurredAt] = useState(initial ? toLocalDateTimeInput(initial.occurredAt) : toLocalDateTimeInput(new Date().toISOString()));
  const [paymentMethod,setPaymentMethod] = useState<ExpenseInput['paymentMethod']>(initial?.paymentMethod ?? 'mobile_money');
  const [note,setNote] = useState(initial?.note ?? '');
  const submit = (e: FormEvent) => { e.preventDefault(); if (!categoryId || !Number(amount)) return; onSave({ amount:Number(amount), occurredAt:new Date(occurredAt).toISOString(), categoryId:Number(categoryId), description:description.trim(), paymentMethod, note:note.trim() || null }); };
  return <form onSubmit={submit} className="form-stack">
    <InputField label="Montant" type="number" value={amount} onChange={setAmount} placeholder="0" min="1" step="1" testId="input-expense-amount" required />
    <InputField label="À quoi correspond cette dépense ?" value={description} onChange={setDescription} placeholder="Ex. Courses du marché" testId="input-expense-description" required />
    <div className="form-row"><SelectField label="Catégorie" value={categoryId} onChange={setCategoryId} testId="select-expense-category">{categories.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</SelectField><SelectField label="Paiement" value={paymentMethod} onChange={v=>setPaymentMethod(v as ExpenseInput['paymentMethod'])} testId="select-payment-method">{Object.entries(paymentLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</SelectField></div>
    <InputField label="Date et heure" type="datetime-local" value={occurredAt} onChange={setOccurredAt} testId="input-expense-date" required />
    <label className="field"><span>Une précision (facultatif)</span><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Un détail à garder en tête…" rows={3} data-testid="input-expense-note" /></label>
    <div className="form-actions">{onCancel && <Button variant="secondary" onClick={onCancel}>Annuler</Button>}<Button type="submit" disabled={saving || !categories.length} testId="button-save-expense">{saving ? 'Enregistrement…' : initial ? 'Enregistrer les changements' : 'Enregistrer la dépense'}</Button></div>
    {!categories.length && <p className="form-hint">Créez une catégorie dans les réglages avant de noter une dépense.</p>}
  </form>;
}
function AddPage() {
  const {data: categories = [], isLoading, isError, refetch} = useListCategories();
  const create = useCreateExpense(); const invalidate = useInvalidate(); const [,setLocation] = useLocation();
  const save = (data: ExpenseInput) => create.mutate({data},{onSuccess:()=>{invalidate();setLocation('/dashboard');}});
  return <AppShell title="Nouvelle dépense"><PageTitle eyebrow="UNE NOTE, ET C’EST TOUT" title="Noter une dépense." description="Gardez une trace pendant que c’est encore frais." action={<Link href="/history" className="btn btn-secondary button" data-testid="link-back-history"><ArrowLeft size={16} />Historique</Link>} />
    <div className="add-layout"><div className="form-panel"><div className="form-intro"><span className="form-intro-mark"><Plus size={19} /></span><div><strong>Une dépense à la fois.</strong><p>Les montants sont enregistrés dans votre devise préférée.</p></div></div>{isLoading ? <SpinnerBlock /> : isError ? <ErrorState retry={()=>void refetch()} /> : <ExpenseForm categories={categories} onSave={save} saving={create.isPending} />}{create.isError && <p className="inline-error" role="alert">La dépense n’a pas pu être enregistrée. Réessayez.</p>}</div><aside className="add-aside"><div className="add-aside-art"><div className="receipt"><span /><span /><span /><span /><b /></div><div className="receipt-shadow" /></div><div className="eyebrow">UN PETIT REPÈRE</div><h3 className="serif">Une bonne note<br />n’a pas besoin d’être parfaite.</h3><p>Le montant et la catégorie suffisent. Ajoutez une précision seulement si elle vous sera utile plus tard.</p><div className="privacy-line"><ShieldCheck size={16} /><span>Vos données restent dans votre espace privé.</span></div></aside></div>
  </AppShell>;
}

function HistoryPage() {
  const [search,setSearch] = useState(''); const [category,setCategory] = useState(''); const [from,setFrom] = useState(''); const [to,setTo] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [editing,setEditing] = useState<Expense | null>(null); const [deleting,setDeleting] = useState<Expense | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const params = useMemo<ListExpensesParams>(()=>({search:search || undefined, categoryId:category ? Number(category) : undefined, from:from || undefined, to:to || undefined}),[search,category,from,to]);
  const {data:expenses,isLoading,isError,refetch} = useListExpenses(params);
   const {data:categories=[]} = useListCategories(); const {data:settings}=useGetSettings(); const currency=settings?.currency ?? 'XAF';
  const invalidate=useInvalidate(); const update=useUpdateExpense(); const remove=useDeleteExpense();
  return <AppShell title="Historique"><PageTitle eyebrow="VOTRE CARNET" title="Tout retrouver." description="Cherchez, filtrez et ajustez vos dépenses enregistrées." action={<Link href="/add" className="btn btn-primary button title-action" data-testid="link-history-add"><Plus size={16} />Ajouter</Link>} />
     <Card className="history-panel"><div className="filter-bar"><label className="search-input"><Search size={17} /><input ref={searchRef} placeholder="Rechercher une dépense…" value={search} onChange={e=>setSearch(e.target.value)} data-testid="input-search-expenses" /><kbd>⌘ K</kbd></label><SelectField label="" value={category} onChange={setCategory} testId="filter-category"><option value="">Toutes les catégories</option>{categories.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</SelectField><div className="date-filter"><input aria-label="Depuis le" type="date" value={from} onChange={e=>setFrom(e.target.value)} data-testid="filter-from-date" /><span>à</span><input aria-label="Jusqu’au" type="date" value={to} onChange={e=>setTo(e.target.value)} data-testid="filter-to-date" /></div><button className="icon-button filter-reset" onClick={()=>{setSearch('');setCategory('');setFrom('');setTo('');}} aria-label="Effacer les filtres" data-testid="button-clear-filters"><X size={16} /></button></div>
      <div className="list-summary"><span>{isLoading ? 'Recherche en cours…' : `${expenses?.length ?? 0} résultat${expenses?.length === 1 ? '' : 's'}`}</span><span><SlidersHorizontal size={14} /> Filtrez à votre façon</span></div>
      {isLoading ? <SpinnerBlock /> : isError ? <ErrorState retry={()=>void refetch()} /> : expenses?.length ? <div className="expense-list">{expenses.map((expense,index)=><ExpenseRow key={expense.id} expense={expense} currency={currency} index={index} onEdit={setEditing} onDelete={setDeleting} />)}</div> : <EmptyState title={search || category || from || to ? 'Aucun résultat pour ces filtres' : 'Pas encore de dépenses notées'} text={search || category || from || to ? 'Essayez un autre mot, une autre catégorie ou une plage de dates.' : 'Les dépenses que vous ajouterez apparaîtront ici.'} action={!search && !category && !from && !to ? <Link className="text-link" href="/add" data-testid="link-empty-history-add">Noter une dépense <ArrowRight size={14} /></Link> : undefined} />}
    </Card>
     {editing && <Modal title="Modifier la dépense" close={()=>{setEditing(null);update.reset();}}><ExpenseForm categories={categories} initial={editing} onCancel={()=>{setEditing(null);update.reset();}} saving={update.isPending} onSave={data=>update.mutate({id:editing.id,data},{onSuccess:()=>{invalidate();setEditing(null);update.reset();}})} />{update.isError&&<p className="inline-error" role="alert">La dépense n’a pas pu être modifiée. Réessayez.</p>}</Modal>}
     {deleting && <Modal title="Retirer cette note ?" close={()=>{setDeleting(null);remove.reset();}}><p className="confirm-copy">« {deleting.description} » sera supprimée de votre historique. Cette action ne peut pas être annulée.</p>{remove.isError&&<p className="inline-error" role="alert">La dépense n’a pas pu être supprimée. Réessayez.</p>}<div className="form-actions"><Button variant="secondary" onClick={()=>{setDeleting(null);remove.reset();}}>Garder</Button><Button variant="danger" disabled={remove.isPending} onClick={()=>remove.mutate({id:deleting.id},{onSuccess:()=>{invalidate();setDeleting(null);remove.reset();}})} testId="button-confirm-delete-expense">{remove.isPending ? 'Suppression…' : 'Supprimer'}</Button></div></Modal>}
  </AppShell>;
}

const periodToApi: Record<string, GetAnalyticsParams['period']> = { daily:'day', weekly:'week', monthly:'month', yearly:'year', custom:'custom' };
function AnalyticsPage() {
  const [period,setPeriod] = useState<'daily'|'weekly'|'monthly'|'yearly'|'custom'>('monthly');
  const [from,setFrom] = useState(''); const [to,setTo] = useState('');
  const params = useMemo<GetAnalyticsParams>(()=>({period:periodToApi[period],...(period==='custom' && from ? {from} : {}),...(period==='custom' && to ? {to} : {})}),[period,from,to]);
  const customRangeReady = period !== 'custom' || (!!from && !!to && from <= to);
  const {data,isLoading,isError,refetch} = useGetAnalytics(params, {query:{queryKey:getGetAnalyticsQueryKey(params),enabled:customRangeReady}});
   const {data:settings} = useGetSettings(); const currency=settings?.currency ?? 'XAF';
  const timeline = data?.timeline ?? []; const maxTimeline = Math.max(0,...timeline.map(x=>x.amount));
  const categories = data?.categories ?? []; const maxCategory = Math.max(0,...categories.map(x=>x.amount));
  const hasData = !!data && data.expenseCount > 0;
  return <AppShell title="Analyses"><PageTitle eyebrow="VOS DONNÉES, VOTRE HISTOIRE" title="Voir ce qui se dessine." description="Des repères calculés uniquement à partir de vos dépenses." />
    <div className="period-toolbar"><div className="period-tabs" role="tablist" aria-label="Période d’analyse">{(['daily','weekly','monthly','yearly','custom'] as const).map((p,i)=><button role="tab" aria-selected={period===p} onClick={()=>setPeriod(p)} className={period===p?'selected':''} key={p} data-testid={`tab-period-${p}`}>{['Jour','Semaine','Mois','Année','Personnalisée'][i]}</button>)}</div>{period==='custom' && <div className="custom-dates"><input type="date" value={from} onChange={e=>setFrom(e.target.value)} aria-label="Date de début" data-testid="input-analytics-from" /><span>à</span><input type="date" value={to} onChange={e=>setTo(e.target.value)} aria-label="Date de fin" data-testid="input-analytics-to" /></div>}</div>
     {!customRangeReady ? <div className="welcome-empty-panel"><EmptyState title="Choisissez une période complète" text="Sélectionnez une date de début et une date de fin, dans cet ordre, pour lancer l’analyse." /></div> : isLoading ? <div className="analytics-grid"><Card><SpinnerBlock /></Card><Card><SpinnerBlock /></Card></div> : isError ? <ErrorState retry={()=>void refetch()} /> : !hasData ? <div className="welcome-empty-panel"><EmptyState title="Les tendances viendront avec vos notes" text="Quand vous aurez enregistré des dépenses, cette page fera apparaître les tendances de votre propre historique." action={<Link className="btn btn-primary button" href="/add" data-testid="link-analytics-add"><Plus size={16} />Noter une dépense</Link>} /></div> :
    <>
      <div className="analytics-summary"><div className="analytics-primary"><div className="eyebrow">{periodNames[period]} — DÉPENSES ENREGISTRÉES</div><strong className="serif mono" data-testid="text-analytics-total">{formatMoney(data?.total,currency)}</strong><div className="analytics-compare">{data?.changePercent == null ? <span>Pas de période précédente à comparer</span> : <span className={`change-pill ${data.changePercent > 0 ? 'change-up' : 'change-down'}`}>{data.changePercent > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(data.changePercent).toLocaleString('fr-FR')} %</span>}<span>par rapport à la période précédente</span></div></div><div className="analytics-secondary"><div><span>Par jour en moyenne</span><strong className="mono">{formatMoney(data?.dailyAverage,currency)}</strong></div><div><span>Dépenses notées</span><strong className="mono">{data?.expenseCount}</strong></div></div></div>
      <div className="analytics-grid">
        <Card className="chart-card timeline-card"><div className="panel-heading"><div><div className="eyebrow">DANS LE TEMPS</div><h2 className="serif">Le fil des dépenses</h2></div><span className="chart-legend"><i />Montant</span></div>{timeline.length ? <div className="bar-chart" data-testid="chart-timeline">{timeline.map((point,i)=><div className="bar-col" key={`${point.date}-${i}`} title={`${point.label} · ${formatMoney(point.amount,currency)}`}><div className="bar-val">{formatMoney(point.amount,currency)}</div><div className="bar-track"><i style={{height:`${maxTimeline ? Math.max(point.amount > 0 ? 4 : 0, point.amount/maxTimeline*100) : 0}%`}} /></div><span>{point.label}</span></div>)}</div> : <EmptyState title="Pas de rythme à afficher" text="Vos dépenses apparaîtront ici." />}</Card>
        <Card className="chart-card"><div className="panel-heading"><div><div className="eyebrow">PAR CATÉGORIE</div><h2 className="serif">Vos postes</h2></div><span className="round-icon"><BarChart3 size={16} /></span></div>{categories.length ? <div className="category-chart" data-testid="chart-categories">{categories.slice(0,6).map((cat,i)=><div className="category-bar-row" key={cat.categoryId}><div className="category-bar-label"><span className="category-swatch" style={{background:palette[i%palette.length]}} />{cat.name}<span className="category-share">{Math.round(cat.share)}%</span></div><div className="category-progress"><i style={{width:`${maxCategory ? cat.amount/maxCategory*100 : 0}%`,background:palette[i%palette.length]}} /></div><strong className="mono">{formatMoney(cat.amount,currency)}</strong></div>)}</div> : <EmptyState title="Aucune catégorie pour l’instant" text="La répartition apparaîtra après vos premières notes." />}</Card>
        <Card className="chart-card"><div className="panel-heading"><div><div className="eyebrow">VOTRE SEMAINE</div><h2 className="serif">Les jours qui comptent</h2></div></div>{data?.weekdays?.length ? <div className="weekday-chart" data-testid="chart-weekdays">{data.weekdays.map((day,i)=>{const max=Math.max(...data.weekdays.map(d=>d.amount),0);return <div key={`${day.day}-${i}`} title={`${day.day} · ${formatMoney(day.amount,currency)}`}><div className="weekday-bar"><i style={{height:`${max?Math.max(day.amount?3:0,day.amount/max*100):0}%`}} /></div><span>{day.day.slice(0,3)}</span></div>})}</div> : <EmptyState title="Semaine encore vierge" text="Vos habitudes de la semaine se révéleront avec le temps." />}</Card>
        <Card className="highlight-card"><div className="eyebrow">À RETENIR</div><h2 className="serif">Quelques repères.</h2>{data?.topCategory && <div className="highlight-line"><span className="highlight-symbol"><Wallet size={16} /></span><div><small>Catégorie principale</small><strong>{data.topCategory.name} <i>·</i> {formatMoney(data.topCategory.amount,currency)}</strong></div></div>}{data?.largestExpense && <div className="highlight-line"><span className="highlight-symbol coral"><TrendingDown size={16} /></span><div><small>Plus grosse dépense</small><strong>{data.largestExpense.description} <i>·</i> {formatMoney(data.largestExpense.amount,currency)}</strong><span>{formatDate(data.largestExpense.occurredAt)}</span></div></div>}{data?.mostExpensiveDay && <div className="highlight-line"><span className="highlight-symbol gold"><CalendarDays size={16} /></span><div><small>Journée la plus dépensière</small><strong>{data.mostExpensiveDay.label} <i>·</i> {formatMoney(data.mostExpensiveDay.amount,currency)}</strong></div></div>}</Card>
      </div>
      {data?.insights?.length ? <section className="insights-section"><div className="insight-heading"><div><div className="eyebrow">CE QUE VOS NOTES RACONTENT</div><h2 className="serif">Des observations, pas des jugements.</h2></div><Zap size={19} /></div><div className="insight-list">{data.insights.map((insight,i)=><div className="insight-item" key={`${i}-${insight}`} data-testid={`insight-${i}`}><span className="insight-number">0{i+1}</span><p>{insight}</p><ArrowRight size={15} /></div>)}</div></section> : null}
    </>}
  </AppShell>;
}

function BudgetPage() {
  const {data:budgets=[],isLoading,isError,refetch}=useListBudgets(); const {data:categories=[]}=useListCategories(); const {data:settings}=useGetSettings();
  const {data:allExpenses=[]}=useListExpenses();
  const currency=settings?.currency ?? 'XAF'; const [modal,setModal]=useState(false); const [editing,setEditing]=useState<Budget|null>(null); const [deleting,setDeleting]=useState<Budget|null>(null);
  const create=useCreateBudget(); const update=useUpdateBudget(); const remove=useDeleteBudget(); const invalidate=useInvalidate();
  const [period,setPeriod]=useState<BudgetInput['period']>('monthly'); const [amount,setAmount]=useState(''); const [categoryId,setCategoryId]=useState('');
  const openNew=()=>{create.reset();update.reset();setEditing(null);setPeriod('monthly');setAmount('');setCategoryId('');setModal(true);};
  const openEdit=(budget:Budget)=>{create.reset();update.reset();setEditing(budget);setPeriod(budget.period);setAmount(String(budget.amount));setCategoryId(budget.categoryId ? String(budget.categoryId):'');setModal(true);};
  const save=(e:FormEvent)=>{e.preventDefault();const data:BudgetInput={period,amount:Number(amount),categoryId:categoryId?Number(categoryId):null};const opts={onSuccess:()=>{invalidate();setModal(false);}};if(editing)update.mutate({id:editing.id,data},opts);else create.mutate({data},opts);};
  const spentFor=(budget:Budget)=>{
    const now=new Date();let start=new Date(now.getFullYear(),now.getMonth(),now.getDate());let end=new Date(start);
    if(budget.period==='weekly'){start.setDate(start.getDate()-((start.getDay()+6)%7));end=new Date(start);end.setDate(start.getDate()+7);}
    else if(budget.period==='monthly'){start=new Date(now.getFullYear(),now.getMonth(),1);end=new Date(now.getFullYear(),now.getMonth()+1,1);}
    else if(budget.period==='yearly'){start=new Date(now.getFullYear(),0,1);end=new Date(now.getFullYear()+1,0,1);}
    else end.setDate(start.getDate()+1);
    return allExpenses.reduce((sum,expense)=>{const time=new Date(expense.occurredAt).getTime();return time>=start.getTime()&&time<end.getTime()&&(!budget.categoryId||expense.categoryId===budget.categoryId)?sum+expense.amount:sum;},0);
  };
  return <AppShell title="Budgets"><PageTitle eyebrow="DES LIMITES QUI VOUS RESSEMBLENT" title="Donner un cap." description="Posez des repères souples pour vos dépenses." action={<Button onClick={openNew} testId="button-add-budget"><Plus size={16} />Créer un budget</Button>} />
    {isLoading?<SpinnerBlock/>:isError?<ErrorState retry={()=>void refetch()}/>:budgets.length===0?<div className="welcome-empty-panel"><EmptyState title="Votre budget, à votre mesure" text="Créez un premier repère pour une période ou une catégorie. Il n’y a pas de montant prédéfini." action={<Button onClick={openNew} testId="button-first-budget"><Plus size={16} />Définir un budget</Button>} /></div>:
    <div className="budget-page-grid">{budgets.map((budget)=>{const spent=spentFor(budget);const ratio=budget.amount?Math.min(100,spent/budget.amount*100):0;return <Card className="budget-item" key={budget.id} testId={`card-budget-${budget.id}`}><div className="budget-item-head"><div><span className="budget-period-tag">{periodNames[budget.period]}</span><h2 className="serif">{budget.categoryName || 'Toutes les catégories'}</h2></div><div className="budget-actions"><button className="icon-button small" onClick={()=>openEdit(budget)} aria-label="Modifier le budget" data-testid={`button-edit-budget-${budget.id}`}><Pencil size={15}/></button><button className="icon-button small danger-icon" onClick={()=>setDeleting(budget)} aria-label="Supprimer le budget" data-testid={`button-delete-budget-${budget.id}`}><Trash2 size={15}/></button></div></div><div className="budget-item-amount"><strong className="mono">{formatMoney(budget.amount,currency)}</strong><span>plafond défini</span></div><div className="budget-track"><i className={ratio>=85?'over-budget':''} style={{width:`${ratio}%`}}/></div><div className="budget-caption"><span>{formatMoney(spent,currency)} utilisé</span><span>{ratio>=100?'Budget dépassé':ratio>=85?'Budget bientôt atteint':`${Math.round(ratio)} %`}</span></div></Card>})}</div>}
    <div className="budget-note"><CircleHelp size={16}/><span>Un budget est un repère personnel. Seules les dépenses réellement enregistrées sont prises en compte.</span></div>
     {modal&&<Modal title={editing?'Ajuster le budget':'Créer un budget'} close={()=>setModal(false)}><form onSubmit={save} className="form-stack"><SelectField label="Période" value={period} onChange={v=>setPeriod(v as BudgetInput['period'])} testId="select-budget-period">{(['daily','weekly','monthly','yearly'] as const).map(p=><option key={p} value={p}>{periodNames[p]}</option>)}</SelectField><InputField label="Montant plafond" type="number" value={amount} onChange={setAmount} placeholder="0" min="0.01" step="0.01" testId="input-budget-amount" required/><SelectField label="Appliquer à" value={categoryId} onChange={setCategoryId} testId="select-budget-category"><option value="">Toutes les catégories</option>{categories.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</SelectField>{(create.isError||update.isError)&&<p className="inline-error" role="alert">Un budget pour cette période et cette catégorie existe déjà, ou les données sont invalides.</p>}<div className="form-actions"><Button variant="secondary" onClick={()=>setModal(false)}>Annuler</Button><Button type="submit" disabled={create.isPending||update.isPending} testId="button-save-budget">{create.isPending||update.isPending?'Enregistrement…':'Enregistrer le budget'}</Button></div></form></Modal>}
     {deleting&&<Modal title="Supprimer ce budget ?" close={()=>{setDeleting(null);remove.reset();}}><p className="confirm-copy">Le repère « {deleting.categoryName || 'Toutes les catégories'} » sera supprimé. Vos dépenses ne seront pas affectées.</p>{remove.isError&&<p className="inline-error" role="alert">Le budget n’a pas pu être supprimé. Réessayez.</p>}<div className="form-actions"><Button variant="secondary" onClick={()=>{setDeleting(null);remove.reset();}}>Annuler</Button><Button variant="danger" onClick={()=>remove.mutate({id:deleting.id},{onSuccess:()=>{invalidate();setDeleting(null);remove.reset();}})} disabled={remove.isPending} testId="button-confirm-delete-budget">Supprimer</Button></div></Modal>}
  </AppShell>;
}

function SettingsPage() {
  const {data:settings,isLoading,isError,refetch}=useGetSettings(); const {data:categories=[],isLoading:loadingCats}=useListCategories();
  const updateSettings=useUpdateSettings(); const createCategory=useCreateCategory(); const updateCategory=useUpdateCategory(); const deleteCategory=useDeleteCategory();
  const qc=useQueryClient(); const invalidate=useInvalidate(); const [currency,setCurrency]=useState('XAF');const [theme,setTheme]=useState<'light'|'dark'|'system'>('system');const [notice,setNotice]=useState('');
  const [name,setName]=useState('');const [color,setColor]=useState('#315e4b');const [editing,setEditing]=useState<Category|null>(null);const [deleteTarget,setDeleteTarget]=useState<Category|null>(null);
  useEffect(()=>{if(settings){setCurrency(settings.currency);setTheme(settings.theme);}},[settings?.currency,settings?.theme]);
  const saveSettings=(e:FormEvent)=>{e.preventDefault();updateSettings.mutate({data:{currency,theme}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetSettingsQueryKey()});setNotice('Vos réglages sont enregistrés.');window.setTimeout(()=>setNotice(''),3200);}});};
  const saveCategory=(e:FormEvent)=>{e.preventDefault();const data:CategoryInput={name:name.trim(),color};if(editing)updateCategory.mutate({id:editing.id,data},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListCategoriesQueryKey()});invalidate();setEditing(null);setName('');}});else createCategory.mutate({data},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListCategoriesQueryKey()});invalidate();setName('');setColor('#315e4b');}});};
  const beginEdit=(cat:Category)=>{setEditing(cat);setName(cat.name);setColor(cat.color);};
  const cancelEdit=()=>{setEditing(null);setName('');setColor('#315e4b');};
  const saveBusy=createCategory.isPending||updateCategory.isPending;
  return <AppShell title="Réglages"><PageTitle eyebrow="À VOTRE FAÇON" title="Un espace qui vous ressemble." description="Choisissez la devise, l’apparence et vos catégories." />
    {isLoading||loadingCats?<SpinnerBlock/>:isError?<ErrorState retry={()=>void refetch()}/>:<div className="settings-grid">
      <Card className="settings-card"><div className="settings-card-head"><span className="settings-icon"><SlidersHorizontal size={18}/></span><div><h2 className="serif">Préférences</h2><p>La façon dont votre espace s’affiche.</p></div></div><form className="form-stack" onSubmit={saveSettings}><SelectField label="Devise" value={currency} onChange={setCurrency} testId="select-currency"><option value="XOF">Franc CFA BCEAO · XOF</option><option value="XAF">Franc CFA BEAC · XAF</option><option value="EUR">Euro · EUR</option><option value="USD">Dollar américain · USD</option></SelectField><p className="muted-note">Le changement de devise modifie l’affichage uniquement ; les montants enregistrés ne sont pas convertis.</p><div className="theme-field"><span className="field-label">Apparence</span><div className="theme-options">{([{value:'light',label:'Clair',icon:Sun},{value:'dark',label:'Sombre',icon:Moon},{value:'system',label:'Système',icon:Settings}] as const).map(opt=>{const Icon=opt.icon;return <button type="button" key={opt.value} className={`theme-option ${theme===opt.value?'chosen':''}`} onClick={()=>setTheme(opt.value)} data-testid={`button-theme-${opt.value}`}><Icon size={17}/><span>{opt.label}</span>{theme===opt.value&&<Check size={14}/>}</button>})}</div></div>{notice&&<p className="success-note" role="status" data-testid="status-settings-saved"><Check size={15}/>{notice}</p>}{updateSettings.isError&&<p className="inline-error" role="alert">Les préférences n’ont pas pu être enregistrées. Réessayez.</p>}<Button type="submit" disabled={updateSettings.isPending} testId="button-save-settings">{updateSettings.isPending?'Enregistrement…':'Enregistrer les préférences'}</Button></form></Card>
      <Card className="settings-card categories-settings"><div className="settings-card-head"><span className="settings-icon gold"><Wallet size={18}/></span><div><h2 className="serif">Mes catégories</h2><p>Les mots qui donnent du sens à vos dépenses.</p></div></div><div className="category-settings-list">{categories.length?categories.map(cat=><div className="category-settings-row" key={cat.id} data-testid={`category-setting-${cat.id}`}><span className="category-color-dot" style={{background:cat.color}}/><div className="category-settings-copy"><strong>{cat.name}</strong>{cat.isDefault&&<span>Catégorie par défaut</span>}</div>{!cat.isDefault&&<div className="row-actions"><button className="icon-button small" onClick={()=>beginEdit(cat)} aria-label={`Modifier ${cat.name}`} data-testid={`button-edit-category-${cat.id}`}><Pencil size={14}/></button><button className="icon-button small danger-icon" onClick={()=>setDeleteTarget(cat)} aria-label={`Supprimer ${cat.name}`} data-testid={`button-delete-category-${cat.id}`}><Trash2 size={14}/></button></div>}</div>):<p className="muted-note">Vos catégories apparaîtront ici.</p>}</div>
        <form className="category-create-form" onSubmit={saveCategory}><div className="category-form-head"><strong>{editing?'Modifier la catégorie':'Ajouter une catégorie'}</strong>{editing&&<button type="button" className="text-link" onClick={cancelEdit}>Annuler</button>}</div><div className="category-form-row"><input type="color" value={color} onChange={e=>setColor(e.target.value)} aria-label="Couleur de la catégorie" data-testid="input-category-color"/><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex. Maison, santé…" maxLength={60} required data-testid="input-category-name"/><Button type="submit" disabled={saveBusy} testId="button-save-category">{editing?<Check size={16}/>:<Plus size={16}/>}</Button></div></form>
         {createCategory.isError||updateCategory.isError?<p className="inline-error" role="alert">Cette catégorie n’a pas pu être enregistrée. Vérifiez son nom puis réessayez.</p>:null}
      </Card>
      <Card className="privacy-settings"><span className="privacy-setting-icon"><ShieldCheck size={19}/></span><div><h2 className="serif">Un espace qui reste personnel.</h2><p>Vos chiffres servent à construire vos repères. Les analyses s’appuient uniquement sur les dépenses que vous avez notées.</p></div></Card>
    </div>}
     {deleteTarget&&<Modal title="Supprimer cette catégorie ?" close={()=>{setDeleteTarget(null);deleteCategory.reset();}}><p className="confirm-copy">« {deleteTarget.name} » sera retirée. Ses dépenses ou budgets associés doivent être déplacés ou supprimés avant cette action.</p>{deleteCategory.isError&&<p className="inline-error" role="alert">Cette catégorie est encore utilisée par une dépense ou un budget. Retirez d’abord ce lien.</p>}<div className="form-actions"><Button variant="secondary" onClick={()=>{setDeleteTarget(null);deleteCategory.reset();}}>Annuler</Button><Button variant="danger" disabled={deleteCategory.isPending} onClick={()=>deleteCategory.mutate({id:deleteTarget.id},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListCategoriesQueryKey()});invalidate();setDeleteTarget(null);deleteCategory.reset();}})} testId="button-confirm-delete-category">Supprimer</Button></div></Modal>}
  </AppShell>;
}

function AuthPage({ mode }: { mode: 'sign-in'|'sign-up' }) {
  return <div className="auth-backdrop"><div className="auth-aside"><Brand/><div className="auth-aside-copy"><div className="eyebrow">VOTRE QUOTIDIEN, PLUS LISIBLE</div><h1 className="serif">Un espace<br /><em>à vous.</em></h1><p>Retrouvez vos dépenses et vos repères, tranquillement.</p><div className="auth-orbit"><div/><span/><i/></div></div><span className="auth-foot">Mes Dépenses <i>·</i> Vos chiffres, votre regard.</span></div><div className="auth-main"><div className="auth-mobile-brand"><Brand/></div>{mode==='sign-in'?<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />:<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div></div>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) qc.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}
function DashboardRoute() { return <Secure><DashboardPage /></Secure>; }
function AddRoute() { return <Secure><AddPage /></Secure>; }
function HistoryRoute() { return <Secure><HistoryPage /></Secure>; }
function AnalyticsRoute() { return <Secure><AnalyticsPage /></Secure>; }
function BudgetRoute() { return <Secure><BudgetPage /></Secure>; }
function SettingsRoute() { return <Secure><SettingsPage /></Secure>; }
function SignInPage() { return <AuthPage mode="sign-in" />; }
function SignUpPage() { return <AuthPage mode="sign-up" />; }
function NotFound() { return <div className="not-found"><Brand/><div className="eyebrow">PAGE INTROUVABLE</div><h1 className="serif">On a perdu cette page.</h1><p>Le chemin demandé ne mène à aucune dépense connue.</p><Link href="/" className="btn btn-primary button" data-testid="link-not-found-home"><ArrowLeft size={16}/>Retour à l’accueil</Link></div>; }
function ClerkRoutes() {
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={frenchLocalization}
    routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <ClerkQueryClientCacheInvalidator />
    <Switch>
      <Route path="/" component={PublicHome}/>
      <Route path="/sign-in/*?" component={SignInPage}/>
      <Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/dashboard" component={DashboardRoute}/>
      <Route path="/add" component={AddRoute}/>
      <Route path="/analysis" component={AnalyticsRoute}/>
      <Route path="/history" component={HistoryRoute}/>
      <Route path="/budget" component={BudgetRoute}/>
      <Route path="/settings" component={SettingsRoute}/>
      <Route component={NotFound}/>
    </Switch>
  </ClerkProvider>;
}
function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={basePath}><ClerkRoutes /></WouterRouter></QueryClientProvider>;
}

export default App;