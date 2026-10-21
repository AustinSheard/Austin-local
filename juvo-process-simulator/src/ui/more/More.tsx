import type { MorePage } from '../../store/store';
import { LibraryPage } from './Library';
import { QuotesPage } from './Quotes';
import { ComparePage, ScaleUpPage, ScenariosPage } from './Scenarios';
import { QuoteImportPage, SettingsPage } from './Settings';

export function MoreView({ page }: { page: Exclude<MorePage, null> }) {
  switch (page) {
    case 'scenarios': return <ScenariosPage />;
    case 'compare': return <ComparePage />;
    case 'scaleup': return <ScaleUpPage />;
    case 'quotes': return <QuotesPage />;
    case 'library': return <LibraryPage />;
    case 'import': return <QuoteImportPage />;
    case 'settings': return <SettingsPage />;
  }
}
