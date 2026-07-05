import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type RenderItem = (index: number) => React.ReactNode;

interface VirtualGridProps {
    itemCount: number;
    columnWidth: number;
    rowHeight: number;
    gap?: number;
    overscan?: number;
    renderItem: RenderItem;
    className?: string;
    style?: React.CSSProperties;
    getKey?: (index: number) => React.Key;
}

const VirtualGrid: React.FC<VirtualGridProps> = ({
    itemCount,
    columnWidth,
    rowHeight,
    gap = 16,
    overscan = 2,
    renderItem,
    className,
    style,
    getKey
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    useLayoutEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        const update = () => {
            setViewportHeight(node.clientHeight);
            setViewportWidth(node.clientWidth);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(node);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        let rafId = 0;
        const handleScroll = () => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                setScrollTop(node.scrollTop);
                rafId = 0;
            });
        };
        node.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            node.removeEventListener('scroll', handleScroll);
            if (rafId) window.cancelAnimationFrame(rafId);
        };
    }, []);

    const { columns, startRow, endRow, totalRows } = useMemo(() => {
        if (viewportWidth <= 0) {
            return { columns: 1, startRow: 0, endRow: -1, totalRows: 0 };
        }
        const cols = Math.max(1, Math.floor((viewportWidth + gap) / (columnWidth + gap)));
        const rows = Math.ceil(itemCount / cols);
        const start = Math.max(0, Math.floor(scrollTop / (rowHeight + gap)) - overscan);
        const end = Math.min(
            rows - 1,
            Math.ceil((scrollTop + viewportHeight) / (rowHeight + gap)) + overscan
        );
        return { columns: cols, startRow: start, endRow: end, totalRows: rows };
    }, [viewportWidth, itemCount, scrollTop, viewportHeight, columnWidth, rowHeight, gap, overscan]);

    const totalHeight = Math.max(0, totalRows * (rowHeight + gap) - gap);
    const contentWidth = columns > 0 ? (columns * columnWidth) + ((columns - 1) * gap) : 0;
    const horizontalOffset = Math.max(0, Math.floor((viewportWidth - contentWidth) / 2));
    const items: React.ReactNode[] = [];

    for (let row = startRow; row <= endRow; row += 1) {
        for (let col = 0; col < columns; col += 1) {
            const index = row * columns + col;
            if (index >= itemCount) break;
            const top = row * (rowHeight + gap);
            const left = horizontalOffset + (col * (columnWidth + gap));
            items.push(
                <div
                    key={getKey ? getKey(index) : index}
                    style={{
                        position: 'absolute',
                        top,
                        left,
                        width: columnWidth,
                        height: rowHeight
                    }}
                >
                    {renderItem(index)}
                </div>
            );
        }
    }

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ overflowY: 'auto', overflowX: 'hidden', height: '100%', ...style }}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                {items}
            </div>
        </div>
    );
};

export default VirtualGrid;
