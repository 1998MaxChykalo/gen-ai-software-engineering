interface DisclaimerFooterProps {
  disclaimer: string;
}

/**
 * Mandatory footer for every surface that shows forecast or scenario
 * output (agents.md 3.3). Renders the exact `disclaimer` string returned by
 * the API — never hardcoded, never hidden behind a tooltip or collapsed
 * section.
 */
export function DisclaimerFooter({ disclaimer }: DisclaimerFooterProps): JSX.Element {
  return (
    <p className="disclaimer-footer" role="note" data-testid="disclaimer-footer">
      {disclaimer}
    </p>
  );
}
