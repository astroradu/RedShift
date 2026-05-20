import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react';
import { SearchBar2 } from '../SearchBar2';
import type {
  SearchHit,
  SearchResultsMsg,
} from '../../../../workers/skySearch.worker';
import type { NotableStar } from '../../../../types';

const notableStar = (over: Partial<NotableStar> = {}): NotableStar => ({
  id: 1,
  name: 'Vega',
  hd: null,
  hr: null,
  gliese: null,
  bayer_flamsteed: 'α Lyr',
  proper_name: 'Vega',
  ra_rad: 0,
  dec_rad: 0,
  mag: 0.03,
  abs_mag: null,
  spectrum: null,
  color_index: null,
  distance_ly: null,
  ...over,
});

class MockWorker {
  private listener: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    if (type === 'message') this.listener = fn;
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    if (type === 'message' && this.listener === fn) this.listener = null;
  }
  reply(msg: SearchResultsMsg) {
    this.listener?.({ data: msg } as MessageEvent);
  }
}

describe('SearchBar2', () => {
  let worker: MockWorker;
  beforeEach(() => {
    worker = new MockWorker();
  });
  afterEach(() => {
    cleanup();
  });

  test('closed → click expands, ESC collapses', () => {
    const { container } = render(
      <SearchBar2
        worker={worker as unknown as Worker}
        starsVisible={true}
        galaxiesVisible={true}
        onPick={vi.fn()}
      />,
    );
    expect(container.querySelector('.sky2-search.open')).toBeNull();

    fireEvent.click(screen.getByLabelText('Search stars and galaxies'));
    expect(container.querySelector('.sky2-search.open')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.sky2-search.open')).toBeNull();
  });

  test('typing posts query, results render', () => {
    render(
      <SearchBar2
        worker={worker as unknown as Worker}
        starsVisible={true}
        galaxiesVisible={true}
        onPick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Search stars and galaxies'));
    const input = screen.getByPlaceholderText('Search stars and galaxies…');
    fireEvent.change(input, { target: { value: 'vega' } });

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'query', q: 'vega' }),
    );
    const calls = worker.postMessage.mock.calls;
    const seq = (calls[calls.length - 1][0] as { seq: number }).seq;

    act(() => {
      worker.reply({
        type: 'results',
        seq,
        items: [{ kind: 'star', star: notableStar(), rank: 3 } as SearchHit],
        hiddenHitCount: 0,
      });
    });

    expect(screen.getByText('Vega')).toBeTruthy();
  });

  test('empty + hiddenHitCount > 0 shows hidden-layers hint', () => {
    render(
      <SearchBar2
        worker={worker as unknown as Worker}
        starsVisible={false}
        galaxiesVisible={false}
        onPick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Search stars and galaxies'));
    fireEvent.change(
      screen.getByPlaceholderText('Search stars and galaxies…'),
      { target: { value: 'vega' } },
    );
    const calls = worker.postMessage.mock.calls;
    const seq = (calls[calls.length - 1][0] as { seq: number }).seq;
    act(() => {
      worker.reply({
        type: 'results',
        seq,
        items: [],
        hiddenHitCount: 3,
      });
    });
    expect(screen.getByText(/hidden/i)).toBeTruthy();
  });

  test('drops stale results from out-of-order replies', () => {
    render(
      <SearchBar2
        worker={worker as unknown as Worker}
        starsVisible={true}
        galaxiesVisible={true}
        onPick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Search stars and galaxies'));
    const input = screen.getByPlaceholderText('Search stars and galaxies…');
    fireEvent.change(input, { target: { value: 'v' } });
    let calls = worker.postMessage.mock.calls;
    const seqV = (calls[calls.length - 1][0] as { seq: number }).seq;
    fireEvent.change(input, { target: { value: 've' } });
    calls = worker.postMessage.mock.calls;
    const seqVe = (calls[calls.length - 1][0] as { seq: number }).seq;
    expect(seqVe).toBeGreaterThan(seqV);

    // Newer reply first.
    act(() => {
      worker.reply({
        type: 'results',
        seq: seqVe,
        items: [{ kind: 'star', star: notableStar({ id: 2, name: 'Vega2', proper_name: 'Vega2' }), rank: 3 } as SearchHit],
        hiddenHitCount: 0,
      });
    });
    expect(screen.getByText('Vega2')).toBeTruthy();

    // Stale reply arrives — should be ignored.
    act(() => {
      worker.reply({
        type: 'results',
        seq: seqV,
        items: [{ kind: 'star', star: notableStar({ id: 99, name: 'ZZZ-stale', proper_name: 'ZZZ-stale' }), rank: 3 } as SearchHit],
        hiddenHitCount: 0,
      });
    });
    expect(screen.queryByText('ZZZ-stale')).toBeNull();
  });
});
