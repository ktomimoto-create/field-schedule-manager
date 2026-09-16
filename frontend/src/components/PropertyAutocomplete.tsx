import React, { useState, useEffect, useRef } from 'react';
import { Building2, Hash, MapPin } from 'lucide-react';
import type { Schedule } from '../types';
import { supabase } from '../supabaseClient';

export interface PropertyCandidate {
  property_name: string;
  unit_number?: string;
  type?: string;
  box?: string;
  area?: string;
  address?: string;
  count?: number; // 過去の登場回数（よく使われる物件を上位表示）
}

interface PropertyAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectCandidate: (candidate: PropertyCandidate) => void;
  schedules?: Schedule[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * 過去のスケジュールデータから物件候補インデックスを構築
 */
export const buildPropertyCandidates = (schedules: Schedule[]): PropertyCandidate[] => {
  const map = new Map<string, PropertyCandidate>();

  for (const s of schedules) {
    const propName = (s.property_name || '').trim();
    if (!propName || propName.startsWith('（') || propName === '未定') continue;

    const unitNum = (s.unit_number || '').trim();
    const key = `${propName}:::${unitNum}`;

    if (map.has(key)) {
      const existing = map.get(key)!;
      existing.count = (existing.count || 1) + 1;
      if (!existing.type && s.type) existing.type = s.type;
      if (!existing.box && s.box) existing.box = s.box;
      if (!existing.area && s.area) existing.area = s.area;
    } else {
      map.set(key, {
        property_name: propName,
        unit_number: unitNum,
        type: s.type || '',
        box: s.box || '',
        area: s.area || '',
        count: 1
      });
    }
  }

  // 登場頻度順にソート
  return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
};

export const PropertyAutocomplete: React.FC<PropertyAutocompleteProps> = ({
  value,
  onChange,
  onSelectCandidate,
  schedules = [],
  placeholder = '物件名を入力（候補から自動入力）',
  className = '',
  disabled = false,
  autoFocus = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [candidates, setCandidates] = useState<PropertyCandidate[]>([]);
  const [filtered, setFiltered] = useState<PropertyCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  // 候補リストの初期構築（過去スケジュールから）
  useEffect(() => {
    if (schedules && schedules.length > 0) {
      setCandidates(buildPropertyCandidates(schedules));
    }
  }, [schedules]);

  // 入力値に応じたフィルタリング＋Supabase properties マスタ検索
  useEffect(() => {
    const query = value.trim().toLowerCase();
    if (!query) {
      setFiltered([]);
      setIsOpen(false);
      return;
    }

    // 1. まずローカルの過去履歴から即座にマッチ（レスポンス遅延ゼロ）
    const localMatches = candidates.filter(c => 
      c.property_name.toLowerCase().includes(query) ||
      (c.unit_number && c.unit_number.toLowerCase().includes(query)) ||
      (c.area && c.area.toLowerCase().includes(query))
    ).slice(0, 8);

    setFiltered(localMatches);
    setIsOpen(localMatches.length > 0);
    setSelectedIndex(-1);

    // 2. Supabase properties マスタを非同期検索してマージ
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .or(`property_name.ilike.%${query}%,unit_number.ilike.%${query}%`)
          .limit(8);

        if (!error && data && data.length > 0) {
          const masterCandidates: PropertyCandidate[] = data.map(p => ({
            property_name: p.property_name || '',
            unit_number: p.unit_number || '',
            type: p.model_type || p.type || '',
            box: p.box_count || p.box || '',
            area: p.area || '',
            address: p.address || '',
            count: 0
          }));

          // 重複排除してマージ
          setFiltered(prev => {
            const map = new Map<string, PropertyCandidate>();
            for (const item of prev) {
              map.set(`${item.property_name}:::${item.unit_number || ''}`, item);
            }
            for (const item of masterCandidates) {
              const key = `${item.property_name}:::${item.unit_number || ''}`;
              if (!map.has(key)) {
                map.set(key, item);
              }
            }
            const merged = Array.from(map.values()).slice(0, 10);
            if (merged.length > 0) setIsOpen(true);
            return merged;
          });
        }
      } catch (err) {
        console.error('Failed to query supabase properties in autocomplete:', err);
      }
    }, 250);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [value, candidates]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (cand: PropertyCandidate) => {
    onChange(cand.property_name);
    onSelectCandidate(cand);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < filtered.length) {
        e.preventDefault();
        handleSelect(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="property-autocomplete-container" style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        className={`form-control ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (filtered.length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
      />

      {isOpen && filtered.length > 0 && (
        <div 
          className="property-autocomplete-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-glass, #cbd5e1)',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '4px 0'
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', borderBottom: '1px solid var(--border-glass, #e2e8f0)', fontWeight: 'bold' }}>
            ⚡ 物件マスタ・履歴サジェスト（選択で自動補完）
          </div>
          {filtered.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={`${item.property_name}_${item.unit_number || ''}_${idx}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--primary, #4f46e5)' : '3px solid transparent',
                  transition: 'background-color 0.1s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary, #0f172a)' }}>
                    <Building2 size={13} style={{ marginRight: '4px', verticalAlign: 'middle', color: 'var(--primary, #4f46e5)' }} />
                    {item.property_name}
                  </span>
                  {item.unit_number && (
                    <span style={{ fontSize: '0.75rem', background: 'var(--bg-tertiary, #f1f5f9)', padding: '1px 5px', borderRadius: '3px', fontWeight: '600', color: 'var(--text-secondary, #334155)' }}>
                      <Hash size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                      {item.unit_number}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', paddingLeft: '17px', flexWrap: 'wrap' }}>
                  {item.type && <span>タイプ: {item.type}</span>}
                  {item.box && <span>BOX: {item.box}</span>}
                  {item.area && (
                    <span>
                      <MapPin size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} />
                      {item.area}
                    </span>
                  )}
                  {item.address && (
                    <span style={{ color: 'var(--text-secondary, #475569)', fontStyle: 'italic' }}>
                      {item.address}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
