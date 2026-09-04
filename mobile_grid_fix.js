// Grid usability: player names stay visible; question column never freezes.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    /* Give the full pick grids their own scroll area so sticky player headers work
       on both desktop and mobile. */
    #leagueBox .tablewrap,
    #historyBox .tablewrap {
      max-height: 72vh;
      overflow: auto !important;
      -webkit-overflow-scrolling: touch;
    }

    /* Questions should always scroll normally — never freeze on the left. */
    #leagueBox .table th:first-child,
    #leagueBox .table td:first-child,
    #historyBox .table th:first-child,
    #historyBox .table td:first-child {
      position: static !important;
      left: auto !important;
      z-index: auto !important;
      white-space: normal;
    }

    /* Keep player names visible at the top on computer and phone. */
    #leagueBox .table thead th:not(:first-child),
    #historyBox .table thead th:not(:first-child) {
      position: sticky !important;
      top: 0;
      z-index: 6 !important;
      background: var(--panel) !important;
      box-shadow: 0 1px 0 var(--line);
    }

    @media (max-width: 760px) {
      #leagueBox .tablewrap,
      #historyBox .tablewrap {
        max-height: 68vh;
      }

      #leagueBox .table th:first-child,
      #leagueBox .table td:first-child,
      #historyBox .table th:first-child,
      #historyBox .table td:first-child {
        min-width: 150px;
        max-width: 190px;
      }
    }
  `;
  document.head.appendChild(style);
})();
