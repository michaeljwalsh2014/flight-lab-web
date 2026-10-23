/** Reveal the beginning of the latest reply without scrolling the surrounding page. */
export function scrollToReplyStart(container: HTMLElement, reply: HTMLElement) {
  const top = container.scrollTop + reply.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop = Math.max(0, top);
}
