import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './StatsPreview.css';

function StatsPreview() {
  const [stats, setStats] = useState({
    wonObjects: 0,
    tenderObjects: 0,
    totalCost: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // 1. Fetch all objects with their statuses
        const { data: objects } = await supabase
          .from('objects')
          .select('*, object_status(id, name)');

        // 2. Count won and tender objects
        const wonCount = objects?.filter(obj => obj.object_status?.name === 'Объекты СУ-10').length || 0;
        const tenderCount = objects?.filter(obj => obj.object_status?.name === 'Тендер').length || 0;

        // 3. Get IDs of СУ-10 objects for cost calculation
        const wonObjectIds = objects
          ?.filter(obj => obj.object_status?.name === 'Объекты СУ-10')
          .map(obj => obj.id) || [];

        // 4. Fetch "Общая стоимость" cost type ID
        const { data: costType } = await supabase
          .from('cost_types')
          .select('id')
          .eq('name', 'Общая стоимость')
          .single();

        // 5. Fetch and sum costs for СУ-10 objects
        let totalCost = 0;
        if (wonObjectIds.length > 0 && costType) {
          const { data: costs } = await supabase
            .from('object_costs')
            .select('summ_works_and_materials')
            .in('object_id', wonObjectIds)
            .eq('cost_type_id', costType.id);

          totalCost = costs?.reduce((sum, cost) => sum + (cost.summ_works_and_materials || 0), 0) || 0;
        }

        setStats({
          wonObjects: wonCount,
          tenderObjects: tenderCount,
          totalCost: totalCost
        });
      } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <section className="stats-preview">
      <div className="stats-preview-container">
        <div className="stats-preview-header">
          <h2 className="stats-preview-title">Общая статистика</h2>
          <p className="stats-preview-subtitle">
            Аналитика по всем объектам платформы
          </p>
        </div>

        <div className="stats-numbers">
          <div className="stats-number-card">
            <span className="stats-number-value">
              {loading ? '...' : stats.wonObjects}
            </span>
            <span className="stats-number-label">Выигранных объектов</span>
          </div>
          <div className="stats-number-divider"></div>
          <div className="stats-number-card">
            <span className="stats-number-value">
              {loading ? '...' : stats.tenderObjects}
            </span>
            <span className="stats-number-label">Объектов на тендере</span>
          </div>
          <div className="stats-number-divider"></div>
          <div className="stats-number-card">
            <span className="stats-number-value">
              {loading ? '...' : (stats.totalCost / 1000000000).toFixed(2)}
            </span>
            <span className="stats-number-label">Общая стоимость (млрд руб.)</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default StatsPreview;
