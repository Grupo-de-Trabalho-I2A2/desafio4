import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'eventos_ferias' })
export class EventoFerias {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'char', length: 7 })
  competencia!: string; // AAAA-MM

  @Index()
  @Column({ type: 'varchar', length: 32 })
  matricula!: string;

  @Column({ type: 'int' })
  dias_ferias_mes!: number;
}