'use client';
import { motion } from 'framer-motion';
import type { Palace, Star } from '@/lib/ziwei/types';
import { STEMS, BRANCHES } from '@/lib/ziwei/constants';
import clsx from 'clsx';

interface PalaceCellProps {
  palace: Palace;
  onClick?: () => void;
  onStarClick?: (star: Star) => void;
  isSelected?: boolean;
  isSanFang?: boolean;
  delay?: number;
  /** 叠加四化：星名 → 四化类型（'禄'/'权'/'科'/'忌'） */
  overlayStarSiHua?: Record<string, string>;
  /** 叠加标签：'年'（流年）或 '限'（大限） */
  overlayLabel?: string;
  /** 点击叠加四化 badge 回调 */
  onSiHuaClick?: (starName: string, siHua: string) => void;
}

const SIHUA_STYLES: Record<string, string> = {
  '禄': 'badge-lu',
  '权': 'badge-quan',
  '科': 'badge-ke',
  '忌': 'badge-ji',
};

const SiHuaBadge = ({
  siHua,
  overlay,
  label,
  onClick,
}: {
  siHua: string;
  overlay?: boolean;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
}) => {
  return (
    <span
      className={clsx(
        'eastern-sihua-badge',
        SIHUA_STYLES[siHua],
        overlay && 'is-overlay',
        onClick && 'is-clickable',
      )}
      onClick={onClick}
    >
      {overlay && label && <span className="mr-px opacity-70">{label}</span>}
      {siHua}
    </span>
  );
};

export default function PalaceCell({
  palace, onClick, onStarClick, isSelected, isSanFang, delay = 0,
  overlayStarSiHua, overlayLabel, onSiHuaClick,
}: PalaceCellProps) {
  const { branch, stem, name, stars, daXianAge, isCurrentDaXian, isMingGong, isShenGong } = palace;
  const ganzhi = `${STEMS[stem]}${BRANCHES[branch]}`;

  const majorStars = stars.filter(s => s.type === 'major');
  const luckyStars = stars.filter(s => s.type === 'lucky');
  const shaStars = stars.filter(s => s.type === 'sha');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      onClick={onClick}
      className={clsx(
        'palace-cell eastern-palace-cell',
        isCurrentDaXian && 'is-current-daxian',
        isSelected && 'is-selected',
        isSanFang && 'is-sanfang',
        isMingGong && 'is-minggong',
      )}
    >
      {/* 大限年龄 */}
      {daXianAge && (
        <div className="eastern-palace-age">
          {daXianAge[0]}-{daXianAge[1]}
        </div>
      )}

      {/* 宫名行 */}
      <div className="eastern-palace-heading">
        <span className={clsx('eastern-palace-name', isMingGong && 'is-ming', isShenGong && 'is-shen')}>
          {name}
        </span>
        {isMingGong && (
          <span className="eastern-palace-mark is-ming">命</span>
        )}
        {isShenGong && (
          <span className="eastern-palace-mark is-shen">身</span>
        )}
      </div>

      {/* 干支 */}
      <div className="eastern-palace-ganzhi">{ganzhi}</div>

      {/* 主星 */}
      <div className="eastern-palace-stars">
        {majorStars.length === 0 && (
          <span className="eastern-empty-palace">空宫</span>
        )}
        {majorStars.map((star) => {
          const overlaySiHua = overlayStarSiHua?.[star.name];
          return (
            <div
              key={star.name}
              className="eastern-major-star-row"
              onClick={e => { e.stopPropagation(); onStarClick?.(star); }}
            >
              <span className={clsx('eastern-major-star', `is-${star.brightness ?? 'normal'}`)}>
                {star.name}
              </span>
              {star.siHua && <SiHuaBadge siHua={star.siHua} />}
              {overlaySiHua && (
                <SiHuaBadge
                  siHua={overlaySiHua}
                  overlay
                  label={overlayLabel}
                  onClick={e => {
                    e.stopPropagation();
                    onSiHuaClick?.(star.name, overlaySiHua);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 吉星 */}
      {luckyStars.length > 0 && (
        <div className="eastern-minor-stars is-lucky">
          {luckyStars.map(s => {
            const overlaySiHua = overlayStarSiHua?.[s.name];
            return (
              <span key={s.name} className="eastern-minor-star">
                {s.name}
                {s.siHua && <SiHuaBadge siHua={s.siHua} />}
                {overlaySiHua && (
                  <SiHuaBadge
                    siHua={overlaySiHua}
                    overlay
                    label={overlayLabel}
                    onClick={e => {
                      e.stopPropagation();
                      onSiHuaClick?.(s.name, overlaySiHua);
                    }}
                  />
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* 煞星 */}
      {shaStars.length > 0 && (
        <div className="eastern-minor-stars is-sha">
          {shaStars.map(s => (
            <span key={s.name} className="eastern-minor-star">
              {s.name}{s.siHua && <SiHuaBadge siHua={s.siHua} />}
            </span>
          ))}
        </div>
      )}

    </motion.div>
  );
}
