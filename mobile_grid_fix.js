// Mobile grid usability fix: let the question column scroll away on phones.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 760px) {
      #leagueBox .table th[style*="position:sticky"],
      #leagueBox .table td[style*="position:sticky"],
      #historyBox .table th[style*="position:sticky"],
      #historyBox .table td[style*="position:sticky"] {
        position: static !important;
        left: auto !important;
        z-index: auto !important;
      }

      #leagueBox .table th:first-child,
      #leagueBox .table td:first-child,
      #historyBox .table th:first-child,
      #historyBox .table td:first-child {
        min-width: 150px;
        max-width: 190px;
        white-space: normal;
      }
    }
  `;
  document.head.appendChild(style);
})();
