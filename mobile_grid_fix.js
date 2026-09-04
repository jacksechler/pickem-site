// Mobile grid usability: player names stay visible; question column never freezes on phones.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 760px) {
      /* Let the grid itself handle vertical + horizontal scrolling on iPhone. */
      #leagueBox .tablewrap,
      #historyBox .tablewrap {
        max-height: 68vh;
        overflow: auto !important;
        -webkit-overflow-scrolling: touch;
      }

      /* Never freeze the question column on the left. */
      #leagueBox .table th:first-child,
      #leagueBox .table td:first-child,
      #historyBox .table th:first-child,
      #historyBox .table td:first-child {
        position: static !important;
        left: auto !important;
        z-index: auto !important;
        min-width: 150px;
        max-width: 190px;
        white-space: normal;
      }

      /* Keep ONLY player names visible at the top while scrolling through picks. */
      #leagueBox .table thead th:not(:first-child),
      #historyBox .table thead th:not(:first-child) {
        position: sticky !important;
        top: 0;
        z-index: 6 !important;
        background: var(--panel) !important;
        box-shadow: 0 1px 0 var(--line);
      }
    }
  `;
  document.head.appendChild(style);
})();
