// auto_scroll_instagram.js
// Runs inside the Playwright MCP session attached to Chrome
async (page) => {
  const sleep = (ms) => page.waitForTimeout(ms);

  const getContainer = async () => {
    return await page.evaluateHandle(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      for (const d of divs) {
        if (d.scrollHeight > d.clientHeight && d.clientHeight > 200) {
          const style = window.getComputedStyle(d);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            if (d.children.length > 1) {
              return d;
            }
          }
        }
      }
      return null;
    });
  };

  let containerHandle = await getContainer();
  if (!containerHandle.asElement()) {
    return { success: false, error: 'Could not find scroll container in active tab' };
  }

  let unchangedCount = 0;
  let prevHeight = 0;
  let iteration = 0;
  const MAX_UNCHANGED_CHECKS = 6;
  const logs = [];

  while (unchangedCount < MAX_UNCHANGED_CHECKS) {
    iteration++;

    // Scroll to the top of the container
    await page.evaluate((el) => {
      if (el) el.scrollTop = 0;
    }, containerHandle);

    await sleep(1500);

    const currentHeight = await page.evaluate((el) => el ? el.scrollHeight : 0, containerHandle);

    if (currentHeight === prevHeight) {
      unchangedCount++;
      logs.push(`[${iteration}] Height unchanged (${currentHeight}px). Check ${unchangedCount}/${MAX_UNCHANGED_CHECKS}`);
      await sleep(1500);
    } else {
      unchangedCount = 0;
      const diff = currentHeight - prevHeight;
      logs.push(`[${iteration}] Loaded older messages! Height: ${currentHeight}px (+${diff}px)`);
      prevHeight = currentHeight;
    }
  }

  return {
    success: true,
    totalIterations: iteration,
    finalHeight: prevHeight,
    logs: logs.slice(-10)
  };
}
